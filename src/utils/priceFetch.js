// src/utils/priceFetch.js
//
// [P0] 併發限制 + 逾時保護的批次抓取工具。原本直接寫在 FrontendOcrTest.jsx 裡，
// 抽出來是因為這其實跟「報價」無關，是通用的批次網路請求控制邏輯，
// 之後如果其他地方也需要限制併發（例如批次驗證多個 Google Sheets 網址），可以直接重用。

// 🚀 併發限制的批次執行工具：用固定大小的「工作池」依序遞補任務，
// 同一時間最多只有 limit 個請求在飛，其餘排隊等前面完成後遞補上去。
export async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const poolSize = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => runNext()));
  return results;
}

// 🚀 帶逾時的 fetch：避免對方伺服器/代理卡住不回應，單一請求拖住整批作業。
export async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 同一時間最多幾檔股票一起抓報價（避免灌爆 corsproxy.io）
export const PRICE_FETCH_CONCURRENCY = 5;
// 單檔股票報價請求的逾時時間
export const PRICE_FETCH_TIMEOUT_MS = 10000;
