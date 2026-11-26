const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describePublicQueryError } = require('../dist/public-query');

test('errors about the submitted SQL are shown with the line they point at', () => {
  const sql = '\n\nSELECT name,\nFROM sr_snapshots\nORDER B';
  // Postgres reports positions in the trimmed SQL; "FROM" starts at character 14 there.
  assert.deepEqual(
    describePublicQueryError({ code: '42601', message: 'syntax error at or near "FROM"', position: '14' }, sql),
    { status: 400, error: 'syntax error at or near "FROM" (line 4)' }
  );
  assert.deepEqual(
    describePublicQueryError({ code: '42703', message: 'column "nope" does not exist' }),
    { status: 400, error: 'column "nope" does not exist' }
  );
  assert.deepEqual(
    describePublicQueryError({ code: '42501', message: 'permission denied for table wallet_tokens' }),
    { status: 403, error: 'permission denied for table wallet_tokens' }
  );
});

test('server and connection errors stay generic; timeouts get a hint', () => {
  for (const e of [{ code: '28P01', message: 'password authentication failed for user "x"' }, { message: 'ECONNREFUSED' }]) {
    assert.deepEqual(describePublicQueryError(e), { status: 400, error: 'Public query failed' });
  }
  assert.match(describePublicQueryError({ code: '57014', message: 'canceling statement' }).error, /took too long/);
});
