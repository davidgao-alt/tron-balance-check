// balance.ts
const TronWeb: any = require("tronweb").TronWeb;
const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });

function sunToTRX(n: number) { return Number(tronWeb.fromSun(n || 0)); }

(async () => {
  // your address here
  const address = "TXCu9ivZfybabh7r3aSmDPfLH6YybLjuvX";
  const acc = await tronWeb.trx.getAccount(address);

  // Available
  const available = sunToTRX(acc?.balance || 0);

  // Stake 1.0
  const frozenArr = Array.isArray(acc?.frozen) ? acc.frozen : [];
  const stake1Array = frozenArr.reduce((s: number, f: any) => s + (f?.frozen_balance || 0), 0);
  const legacyEnergy = acc?.account_resource?.frozen_balance_for_energy?.frozen_balance || 0;
  const stake1Total = stake1Array + legacyEnergy;

  // Stake 2.0 (self)
  let v2Self = 0;
  if (Array.isArray(acc?.frozenV2)) {
    for (const f of acc.frozenV2) v2Self += (f?.amount || 0);
  }

  // Stake 2.0 (delegated out)
  const dr = acc?.delegated_resource || {};
  const v2DelegOut =
    (dr?.acquired_delegated_balance_for_bandwidth || 0) +
    (dr?.acquired_delegated_balance_for_energy || 0);

  // Frozen total
  const frozenAll = sunToTRX(stake1Total + v2Self + v2DelegOut);

  // Sum check
  const total = (available + frozenAll).toFixed(6);

  console.log(`Address: ${address}`);
  console.log(`Available: ${available} TRX`);

  // breakdown of frozen
  console.log(`  Stake 1.0 total: ${sunToTRX(stake1Total)} TRX`);
  console.log(`  Stake 2.0 self: ${sunToTRX(v2Self)} TRX`);
  console.log(`  Stake 2.0 delegated out: ${sunToTRX(v2DelegOut)} TRX`);

  console.log(`Frozen: ${frozenAll} TRX`);
  console.log(`Total (Available and Frozen): ${total} TRX`);
})();

