const { test } = require('node:test');
const assert = require('node:assert/strict');
const pg = require('pg');
const mstr = require('../dist/mstr-fetch');
const sharp = require('../dist/sharplink-fetch');
const { insertMstrSharplinkToDB } = require('../dist/insert-mstr-sharplink');

for (const fail of ['MSTR', 'SharpLink', null]) {
  test('saves independent snapshots when ' + (fail ?? 'neither') + ' fails', async (t) => {
    const saved = [];
    let migrated = false;
    let ended = false;
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'mock';
    t.after(() => {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    });

    const originalClient = pg.Client;
    t.after(() => { pg.Client = originalClient; });
    pg.Client = class MockClient {
      async connect() {}
      async end() { ended = true; }

      async query(sql, values) {
        if (/^\s*DO\b/i.test(sql)) {
          // Match both $$ and named dollar quotes, including the closing delimiter.
          assert.match(sql, /^\s*[Dd][Oo]\s+(\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$)[\s\S]*\1\s*;?\s*$/);
          assert.match(sql, /ALTER TABLE sharplink_snapshots\s+ALTER COLUMN impact3_total_eth_holdings TYPE numeric/i);
          migrated = true;
          return { rows: [] };
        }

        assert.ok(Array.isArray(values), 'expected parameters for snapshot INSERT');
        if (/^\s*INSERT INTO mstr_snapshots\b/i.test(sql)) {
          saved.push('MSTR');
        } else {
          assert.match(sql, /^\s*INSERT INTO sharplink_snapshots\b/i);
          assert.ok(migrated, 'expected holdings migration before SharpLink INSERT');
          assert.equal(values[5], 123);
          assert.equal(values[13], 896476.09);
          saved.push('SharpLink');
        }
        return { rows: [{ id: 1 }] };
      }
    };

    t.mock.method(mstr, 'fetchMstrSnapshot', async () => {
      if (fail === 'MSTR') throw Error('upstream');
      return {};
    });
    t.mock.method(sharp, 'fetchSharplinkSnapshot', async () => {
      if (fail === 'SharpLink') throw Error('upstream');
      return {
        sharplink: { averageVolume30Day: 123.333333, volume: 999 },
        eth: {},
        impact3: { totalEthHoldings: 896476.09 },
      };
    });

    if (fail) {
      await assert.rejects(insertMstrSharplinkToDB(), { message: 'Snapshot failures: ' + fail });
    } else {
      await insertMstrSharplinkToDB();
    }
    assert.deepEqual(saved.sort(), ['MSTR', 'SharpLink'].filter(source => source !== fail));
    assert.equal(ended, true);
  });
}
