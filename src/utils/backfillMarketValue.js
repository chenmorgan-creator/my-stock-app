// src/utils/backfillMarketValue.js
//
// 「回填遺漏市值」功能：假設某段期間持股組合沒有變化，
// 用每一天的歷史收盤價 × 目前的股數，反推出那幾天的持股總市值（對應 Google Sheet 的 D 欄）。
//
// 注意：這只計算「股票市值」本身，不包含現金（F欄）與融資（K欄），
// 那兩欄使用者自己知道當時的實際數字，本來就該由使用者手動填，這裡不會、也不該去猜測。

import { fetchWithTimeout, PRICE_FETCH_TIMEOUT_MS } from './priceFetch';
import { isMarketOpen } from './marketCalendar';

/**
 * 把日期物件轉成 YYYY-MM-DD（用本地時間，不要用 toISOString，避免時區位移導致日期算錯一天）
 * @param {Date} date
 */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 依起訖日期（含頭尾），列出所有美股交易日。
 * @param {string} startDateStr YYYY-MM-DD
 * @param {string} endDateStr YYYY-MM-DD
 * @returns {string[]} 交易日清單（YYYY-MM-DD），由舊到新排序
 */
export function listTradingDaysBetween(startDateStr, endDateStr) {
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  const days = [];

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return days;

  const cursor = new Date(start);
  while (cursor <= end) {
    if (isMarketOpen(cursor)) {
      days.push(toDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * 依 range 需求，換算成最接近、但足夠涵蓋的 Yahoo Finance range 參數。
 * 抓太短會漏掉早期的日期，抓太長只是多花一點下載量，所以策略是「寧可抓多一點」。
 * @param {number} daysAgo 距離今天最早的那一天，是幾天前
 */
function pickRangeParam(daysAgo) {
  if (daysAgo <= 5) return '5d';
  if (daysAgo <= 28) return '1mo';
  if (daysAgo <= 85) return '3mo';
  if (daysAgo <= 170) return '6mo';
  if (daysAgo <= 350) return '1y';
  return '2y';
}

/**
 * 抓單一檔股票，在指定交易日清單中，每一天的收盤價。
 * @param {string} symbol
 * @param {string[]} tradingDays YYYY-MM-DD 清單
 * @returns {Promise<Map<string, number>>} 日期 -> 收盤價（抓不到的日期不會出現在 Map 裡）
 */
async function fetchSymbolCloseByDate(symbol, tradingDays) {
  const closeByDate = new Map();
  if (tradingDays.length === 0) return closeByDate;

  const earliest = new Date(tradingDays[0] + 'T00:00:00');
  const daysAgo = Math.ceil((Date.now() - earliest.getTime()) / 86400000);
  const rangeParam = pickRangeParam(daysAgo);

  const response = await fetchWithTimeout(
    `/api/quote?symbol=${encodeURIComponent(symbol)}&range=${rangeParam}`,
    PRICE_FETCH_TIMEOUT_MS
  );
  if (!response.ok) return closeByDate;

  const json = await response.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (typeof close !== 'number' || isNaN(close)) continue;
    // Yahoo 回傳的 timestamp 是 UTC 秒數，換成本地日期字串來對齊 tradingDays
    const dateKey = toDateKey(new Date(timestamps[i] * 1000));
    closeByDate.set(dateKey, close);
  }

  return closeByDate;
}

/**
 * 計算一段期間內，每個交易日的持股總市值（假設持股組合在這段期間內沒有變化）。
 * @param {{ ticker: string, shares: string|number }[]} holdings
 * @param {string} startDateStr YYYY-MM-DD
 * @param {string} endDateStr YYYY-MM-DD
 * @param {(info: { completed: number, total: number }) => void} [onProgress]
 * @returns {Promise<{ results: {date: string, marketValue: number, missingTickers: string[]}[], failedTickers: string[] }>}
 */
export async function computeBackfilledMarketValues(holdings, startDateStr, endDateStr, onProgress) {
  const cleanHoldings = holdings
    .filter(h => h.ticker && h.ticker.trim() !== '' && h.shares !== '' && !isNaN(parseFloat(h.shares)))
    .map(h => ({ ticker: h.ticker.trim().toUpperCase(), shares: parseFloat(h.shares) }));

  const tradingDays = listTradingDaysBetween(startDateStr, endDateStr);
  if (cleanHoldings.length === 0 || tradingDays.length === 0) {
    return { results: [], failedTickers: [] };
  }

  const failedTickers = [];
  let completed = 0;

  // 逐檔依序抓取（歷史資料量通常不大，不需要像即時報價那樣做併發限制）
  const perTickerCloses = new Map();
  for (const holding of cleanHoldings) {
    try {
      const closeByDate = await fetchSymbolCloseByDate(holding.ticker, tradingDays);
      perTickerCloses.set(holding.ticker, closeByDate);
    } catch (err) {
      console.warn(`無法取得 ${holding.ticker} 的歷史收盤價`, err);
      perTickerCloses.set(holding.ticker, new Map());
      failedTickers.push(holding.ticker);
    }
    completed++;
    onProgress?.({ completed, total: cleanHoldings.length });
  }

  const results = tradingDays.map(date => {
    let marketValue = 0;
    const missingTickers = [];
    for (const holding of cleanHoldings) {
      const close = perTickerCloses.get(holding.ticker)?.get(date);
      if (typeof close === 'number') {
        marketValue += close * holding.shares;
      } else {
        missingTickers.push(holding.ticker);
      }
    }
    return { date, marketValue, missingTickers };
  });

  return { results, failedTickers: [...new Set(failedTickers)] };
}
