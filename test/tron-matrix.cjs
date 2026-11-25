const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const chain = require('../dist/troninc-revenue-fetch');
const matrix = require('../dist/tron-matrix-fetch');
const sr = require('../dist/tronscan-sr-fetch');
const { runSrSnapshots } = require('../dist/insert-tronscan-sr');
const address = matrix.MATRIX_ADDRESS;

test('new address is recorded before activation without inventing balances', async t => {
  t.mock.method(chain, 'tronGridPost', async path => {
    assert.equal(path, '/wallet/getaccount');
    return {};
  });
  const row = await matrix.fetchMatrixSnapshot();
  assert.equal(row.accountStatus, 'Unactivated');
  assert.equal(row.walletSnapshot, undefined);
  assert.equal(row.realTimeVotes, undefined);
});

for (const phase of ['Activated', 'Candidate', 'SR']) {
  test('collects wallet and applicable witness fields for ' + phase, async t => {
    const registered = phase !== 'Activated';
    const witnesses = [{ address: 'T-other', isJobs: true }];
    if (registered) witnesses.push({ address, isJobs: phase === 'SR', totalProduced: 27 });
    t.mock.method(chain, 'tronGridPost', async path =>
      path === '/wallet/getaccount' ? {address} : {witnesses});
    t.mock.method(chain, 'fetchWalletFromAccount', async walletAddress => {
      assert.equal(walletAddress, address);
      return {trxAvailable: '2.500000', votesUsed: 3, claimableRewardTrx: '0.2', rawJson: {trongrid: {reward: {reward: 200000}}}};
    });
    const detail = t.mock.method(chain, 'tronscanGet', async () => ({
      data: {address, ranking: 29, realTimeVotes: 123, witnessType: 2}
    }));
    const row = await matrix.fetchMatrixSnapshot();
    assert.equal(row.accountStatus, phase);
    assert.equal(row.trxBalance, '2.500000');
    assert.equal(row.walletSnapshot.votesUsed, 3);
    assert.equal(row.reward, 200000);
    assert.equal(detail.mock.callCount(), registered ? 1 : 0);
    if (registered) {
      assert.equal(row.producedTotal, 27);
      assert.equal(row.realTimeRanking, 29);
      assert.equal(row.realTimeVotes, 123);
    }
  });
}

test('upstream error cannot produce an unactivated snapshot', async t => {
  t.mock.method(chain, 'tronGridPost', async () => { throw Error('HTTP 429'); });
  await assert.rejects(matrix.fetchMatrixSnapshot(), /HTTP 429/);
});

test('cron writes wallet and SR in one row, and excludes the saved address from the Top 27 pass', async t => {
  t.mock.method(matrix, 'fetchMatrixSnapshot', async () => ({
    address, name: 'Tron Matrix', accountStatus: 'SR', realTimeVotes: 12, walletSnapshot: {trxTotal: '22'}
  }));
  t.mock.method(sr, 'fetchSrSnapshot', async excluded => {
    assert.equal(excluded, address);
    return [{address: 'original', name: 'original'}];
  });
  const inserts = [];
  t.mock.method(Pool.prototype, 'query', async (sql, values) => {
    assert.match(sql, /INSERT INTO sr_snapshots/);
    inserts.push(values);
    return {rows:[{id:1}]};
  });
  t.mock.method(Pool.prototype, 'end', async () => {});
  await runSrSnapshots();
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0][5], 12);
  assert.deepEqual(inserts[0].slice(-2), ['SR', {trxTotal: '22'}]);
  assert.deepEqual(inserts[1].slice(-2), [null, null]);
});

test('a Matrix outage still allows the regular SR collection to write and reports the failure', async t => {
  t.mock.method(matrix, 'fetchMatrixSnapshot', async () => { throw Error('upstream'); });
  t.mock.method(sr, 'fetchSrSnapshot', async excluded => {
    assert.equal(excluded, undefined);
    return [{address:'original'}];
  });
  const insert = t.mock.method(Pool.prototype, 'query', async () => ({rows:[{id:1}]}));
  t.mock.method(Pool.prototype, 'end', async () => {});
  await assert.rejects(runSrSnapshots(), /Snapshot failures: Tron Matrix/);
  assert.equal(insert.mock.callCount(), 1);
});

test('unindexed candidates keep wallet and on-chain block data; provider errors are distinguishable', async t => {
  t.mock.method(chain, 'tronGridPost', async path => path.endsWith('getaccount')
    ? {address} : {witnesses:[{address:'T-other',isJobs:true},{address,totalProduced:7}]});
  t.mock.method(chain, 'fetchWalletFromAccount', async () => ({
    trxAvailable:'0', claimableRewardTrx:'0', rawJson:{trongrid:{reward:{}}}
  }));
  const scan = t.mock.method(chain, 'tronscanGet', async () => ({code:200,data:null}));
  const waiting = await matrix.fetchMatrixSnapshot();
  assert.equal(waiting.accountStatus, 'Candidate');
  assert.equal(waiting.realTimeRanking, undefined);
  assert.equal(waiting.producedTotal, 7);
  assert.equal(waiting.witnessDetailUnavailable, false);
  scan.mock.mockImplementation(async () => { throw Error('HTTP 503'); });
  const partial = await matrix.fetchMatrixSnapshot();
  assert.equal(partial.witnessDetailUnavailable, true);
  assert.equal(partial.accountStatus, 'Candidate');
  assert.equal(partial.walletSnapshot.trxAvailable, '0');
});
