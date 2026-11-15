const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchSharplinkSnapshot } = require('../dist/sharplink-fetch');
const time = Date.UTC(2026,10,13,21)/1000;
const good = {chart:{result:[{meta:{symbol:'SBET',currency:'USD',regularMarketPrice:10,regularMarketTime:time,currentTradingPeriod:{regular:{end:time}}},timestamp:Array.from({length:32},(_,i)=>time-(31-i)*86400),indicators:{quote:[{close:Array(32).fill(8),volume:Array(32).fill(100)}]}}],error:null}};
const vendor = {chart:{result:null,error:{code:'Not Found'}}};
async function scenario(responses, expectedCalls, error) {
  const originalFetch = global.fetch, originalTimer = global.setTimeout;
  let calls = 0;
  global.setTimeout = (fn, ms, ...args) => originalTimer(fn, ms === 30000 ? ms : 0, ...args);
  global.fetch = async url => {
    if (url.includes('finance.yahoo')) {
      const value = responses[Math.min(calls++, responses.length - 1)];
      if (value instanceof Error) throw value;
      if (value instanceof Response) return value.clone();
      return Response.json(value);
    }
    if (url.includes('eth-coingecko')) return Response.json({price:3000});
    return Response.json({total_eth_holdings:[{'Total ETH Holdings':10}],eth_nav:[{'ETH NAV':30000}],mnav_data:[{mNAV:'1x'}],fdmnav:[{'Fully Diluted mNAV':'1x'}]});
  };
  try {
    if (error) await assert.rejects(fetchSharplinkSnapshot(), error);
    else assert.equal((await fetchSharplinkSnapshot()).sharplink.lastPrice, 10);
    assert.equal(calls, expectedCalls);
  } finally { global.fetch = originalFetch; global.setTimeout = originalTimer; }
}
test('valid response does not retry', () => scenario([good],1));
test('HTTP 200 empty chart retries and recovers', () => scenario([vendor,good],2));
test('persistent chart failure stops after four attempts with diagnostics', () => scenario([vendor],4,/failed after 4 attempts/));
test('invalid JSON retries', () => scenario([new Response('<html>'),good],2));
test('network failure retries', () => scenario([new TypeError('fetch failed'),good],2));
test('rate limiting retries', () => scenario([new Response('',{status:429}),good],2));
test('permanent 403 fails immediately', () => scenario([new Response('',{status:403})],1,/HTTP 403/));
test('invalid price retries', () => scenario([{chart:{result:[{meta:{symbol:'SBET',currency:'USD',regularMarketPrice:0}}]}},good],2));

const { parseYahooQuote } = require('../dist/sharplink-fetch');
test('uses prior daily close, not range previous close', () => {
  const input = structuredClone(good);
  input.chart.result[0].meta.chartPreviousClose = 2;
  const quote = parseYahooQuote(input);
  assert.equal(quote.change, 2);
  assert.equal(quote.changePercent, '25.000000');
  assert.equal(quote.averageVolume30Day, 100);
  assert.equal(quote.latestDate, new Date(time*1000).toISOString());
});
test('in-progress volume excluded from 30-session average', () => {
  const input = structuredClone(good);
  input.chart.result[0].meta.currentTradingPeriod.regular.end = time+3600;
  input.chart.result[0].indicators.quote[0].volume[31] = 999999;
  assert.equal(parseYahooQuote(input).averageVolume30Day, 100);
});
test('rejects mismatched symbol and missing previous close', () => {
  const input = structuredClone(good);
  input.chart.result[0].meta.symbol = 'OTHER';
  assert.throws(()=>parseYahooQuote(input), /valid USD quote/);
  input.chart.result[0].meta.symbol = 'SBET';
  input.chart.result[0].indicators.quote[0].close.fill(null);
  assert.throws(()=>parseYahooQuote(input), /previous session/);
});
