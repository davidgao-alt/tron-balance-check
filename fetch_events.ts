import TronWeb from "tronweb";
import fs from "fs";

// 初始化 TronWeb
const tronWeb = new (TronWeb as any).TronWeb({
  fullHost: "https://api.trongrid.io",
});

const CONTRACT = "TEqiF5JbhDPD77yjEfnEMncGRZNDt2uogD";
const PAGE_LIMIT = 20; // TronGrid 默认 20
const MAX_PAGES = 10;  // 拉 10 页，共 200 条
const OUT = "first200_events.json";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFirst200Events() {
  let all: any[] = [];
  let fingerprint: string | null = null;

  for (let i = 1; i <= MAX_PAGES; i++) {
    try {
      const params: any = {
        limit: PAGE_LIMIT,
        onlyConfirmed: true,
      };
      if (fingerprint) params.fingerprint = fingerprint;

      const res = await (tronWeb as any).event.getEventsByContractAddress(CONTRACT, params);
      const list = res.data || res.result || [];
      if (!list.length) break;

      console.log(`✅ Page ${i} -> +${list.length}`);
      all.push(...list);

      fingerprint = res.meta?.fingerprint || res.fingerprint || null;
      if (!fingerprint) break;

      // 每页之间停 5 秒防止 429
      await sleep(5000);
    } catch (e: any) {
      console.error(`⚠️ Error at page ${i}:`, e?.response?.data?.Error || e.message);
      await sleep(6000); // 被限流多等 6 秒
      i--; // 重试同一页
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
  console.log(`🎉 Done! 共 ${all.length} 条事件，已保存至 ${OUT}`);
}

fetchFirst200Events();

