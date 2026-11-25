const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TronWeb } = require('tronweb');
const { readWatchedAddresses } = require('../dist/fetch-he-votes');
const { createPublicPool, runPublicQuery } = require('../dist/public-query');

test('watch list accepts multiline addresses, deduplicates, and rejects invalid config without echoing it', () => {
  const address = TronWeb.address.fromHex('41' + '01'.repeat(20));
  assert.deepEqual([...readWatchedAddresses([address, '', address].join('\r\n'))], [address]);
  for (const raw of ['', 'invalid', address + '\ninvalid']) {
    assert.throws(() => readWatchedAddresses(raw), {
      message: 'HE_WATCHED_ADDRESSES must contain valid TRON addresses, one per line',
    });
  }
});

test('public SQL requires an independent login even if the owner URL is configured', async () => {
  const writer = 'postgres://writer:writerpass@db:5450/snapshots?user=writer';
  assert.equal(createPublicPool(writer), null);
  const reader = createPublicPool(writer, 'readerpass');
  assert.equal(reader.options.user, 'public_snapshot_reader');
  assert.equal(reader.options.password, 'readerpass');
  assert.equal(reader.options.database, 'snapshots');
  assert.equal(reader.options.port, 5450);
  await reader.end();
});

test('public SQL starts read-only and discards its session when access is denied', async () => {
  const calls = [];
  const client = {
    async query(statement) {
      calls.push(statement);
      if (typeof statement === 'object') throw new Error('permission denied');
    },
    release(destroy) { calls.push(destroy); },
  };
  await assert.rejects(runPublicQuery({ connect: async () => client }, 'SELECT 1'), /permission denied/);
  assert.deepEqual(calls, ['BEGIN READ ONLY', { text: 'SELECT 1', queryMode: 'extended' }, true]);
});
