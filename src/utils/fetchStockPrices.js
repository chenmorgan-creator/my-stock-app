// src/utils/fetchStockPrices.js
// （注意：命名沒有用 use 開頭，因為這裡面沒有呼叫任何 React hook，只是一個一般的 async 函式，
// 用 useXxx 命名反而會誤導其他開發者以為要遵守 hooks 規則，例如放進 useEffect 依賴陣列檢查。）
//
// 從 FrontendOcrTest.jsx 抽出來的「批次抓取股票報價」邏輯（[P0] 已加上併發限制 + 逾時保護）。
// 目前仍然透過 corsproxy.io 呼叫 Yahoo Finance 的公開端點（維持原本行為不變，
// 之後若要換成自架代理或正規 API，只需要改這個檔案裡的 targetUrl / 請求方式）。

import { runWithConcurrencyLimit, fetchWithTimeout, PRICE_FETCH_CONCURRENCY, PRICE_FETCH_TIMEOUT_MS } from '../utils/priceFetch';

/**
 * @param {{ ticker: string, shares: string|number }[]} stocks
 * @param {(info: { completed: number, total: number }) => void} [onProgress]
 * @returns {Promise<{ payload: {Ticker:string, Shares:number, Price:number}[], failedTickers: string[] }>}
 */
export async function fetchStockPrices(stocks, onProgress) {
  let completedCount = 0;
  const failedTickers = [];

  const reportProgress = () => {
    completedCount++;
    onProgress?.({ completed: completedCount, total: stocks.length });
  };

  const payload = await runWithConcurrencyLimit(stocks, PRICE_FETCH_CONCURRENCY, async (stock) => {
    const symbol = stock.ticker.trim().toUpperCase();
    const sharesAmount = parseFloat(stock.shares);

    try {
      // 🚀 關鍵修正：改抓每日K棒的收盤價 (indicators.quote[].close)，而不是 meta.regularMarketPrice
      // regularMarketPrice 這個欄位在收盤後如果有盤後交易，數值會持續跳動，不是鎖定的收盤價
      // range=5d&interval=1d 抓最近5個交易日的日K，並明確關閉盤前盤後資料，確保拿到的是「當天收盤定案」的價格
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d&includePrePost=false`;
      const response = await fetchWithTimeout(`https://corsproxy.io/?${targetUrl}`, PRICE_FETCH_TIMEOUT_MS);
      if (response.ok) {
        const json = await response.json();
        const result = json?.chart?.result?.[0];
        const closes = result?.indicators?.quote?.[0]?.close || [];

        // 從最新的日K往前找，取最後一個「非 null」的收盤價（當天盤中查詢時，最後一根K棒可能還沒收盤、close 會是 null）
        let price = null;
        for (let i = closes.length - 1; i >= 0; i--) {
          if (typeof closes[i] === 'number' && !isNaN(closes[i])) {
            price = closes[i];
            break;
          }
        }
        // 保險：萬一日K資料抓不到，退回用 meta 裡的價格，避免整筆資料變成 0
        if (price === null) {
          const fallback = result?.meta?.regularMarketPrice ?? result?.meta?.previousClose;
          price = typeof fallback === 'number' && !isNaN(fallback) ? fallback : 0;
        }

        reportProgress();
        return { Ticker: symbol, Shares: sharesAmount, Price: price };
      }
      failedTickers.push(symbol);
    } catch (err) {
      console.warn(`無法獲取 ${symbol} 的報價`, err);
      failedTickers.push(symbol);
    }
    reportProgress();
    return { Ticker: symbol, Shares: sharesAmount, Price: 0 };
  });

  return { payload, failedTickers };
}
