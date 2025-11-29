// // mstr-fetch.ts

// function toNumber(x: any): number {
//   if (x == null) return NaN;
//   return Number(String(x).replace(/,/g, ""));
// }

// async function main() {
//   const mstrUrl = "https://api.strategy.com/btc/mstrKpiData";
//   const btcUrl = "https://api.strategy.com/btc/bitcoinKpis";

//   const [mstrRes, btcRes] = await Promise.all([
//     fetch(mstrUrl),
//     fetch(btcUrl),
//   ]);

//   const mstrData = await mstrRes.json();
//   const btcData = await btcRes.json();

//   const m = mstrData[0];
//   const b = btcData.results;

//   const mstrPrice = toNumber(m.price);              
//   const marketCap_Million = toNumber(m.marketCap);
//   const enterpriseValue_Million = toNumber(m.entVal);
//   const debt_Million = toNumber(m.debt);
//   const pref_Million = toNumber(m.pref);

//   // BTC metrics
//   const btcPrice = toNumber(b.latestPrice);         
//   const btcHoldings = toNumber(b.btcHoldings);      
//   const btcNav_Million = toNumber(b.btcNav);         
//   const btcNavNumber_Million = toNumber(b.btcNavNumber);

//   // mNAV = Enterprise Value / BTC NAV
//   const mnav = enterpriseValue_Million / btcNavNumber_Million;

//   const output = {
//     mstrPrice,                     // USD
//     marketCap_Million,             // million USD
//     enterpriseValue_Million,       // million USD
//     debt_Million,                  // million USD
//     pref_Million,                  // million USD

//     btcPrice,                      // USD
//     btcHoldings,                   // BTC
//     btcNav_Million,                // million USD
//     btcNavNumber_Million,          // million USD

//     mnav                           // ratio
//   };

//   console.log(JSON.stringify(output, null, 2));
// }

// main().catch(console.error);



// mstr-fetch.ts

function toNumber(x: any): number {
  if (x == null) return NaN;
  return Number(String(x).replace(/,/g, ""));
}

export async function fetchMstrSnapshot() {
  const mstrUrl = "https://api.strategy.com/btc/mstrKpiData";
  const btcUrl = "https://api.strategy.com/btc/bitcoinKpis";

  const [mstrRes, btcRes] = await Promise.all([
    fetch(mstrUrl),
    fetch(btcUrl),
  ]);

  const mstrData = await mstrRes.json();
  const btcData = await btcRes.json();

  const m = mstrData[0];
  const b = btcData.results;

  const mstrPrice = toNumber(m.price);               // USD
  const marketCap_Million = toNumber(m.marketCap);   // million USD
  const enterpriseValue_Million = toNumber(m.entVal);
  const debt_Million = toNumber(m.debt);
  const pref_Million = toNumber(m.pref);

  // BTC metrics
  const btcPrice = toNumber(b.latestPrice);          // USD
  const btcHoldings = toNumber(b.btcHoldings);      // BTC
  const btcNav_Million = toNumber(b.btcNav);        // million USD
  const btcNavNumber_Million = toNumber(b.btcNavNumber); // million USD

  // mNAV = Enterprise Value / BTC NAV
  const mnav = enterpriseValue_Million / btcNavNumber_Million;

  const output = {
    mstrPrice,
    marketCap_Million,
    enterpriseValue_Million,
    debt_Million,
    pref_Million,
    btcPrice,
    btcHoldings,
    btcNav_Million,
    btcNavNumber_Million,
    mnav,
  };

  return output;
}

// 保留原来的用法：ts-node mstr-fetch.ts 仍然直接打印 JSON
if (require.main === module) {
  fetchMstrSnapshot()
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch(console.error);
}