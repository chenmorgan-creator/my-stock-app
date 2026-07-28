// src/utils/googleSheets.js
//
// 共用的 Google Sheets 讀取邏輯。
// 之前 YieldAnalysis.jsx 與 FrontendOcrTest.jsx 各自寫了一份幾乎相同的
// 「解析網址 -> 組 CSV 匯出連結 -> fetch -> 回傳文字」流程，
// 修 bug 或改行為時很容易只改到一邊。統一抽出來後，兩邊都呼叫同一份實作。

/**
 * 從 Google Sheets 分享網址解析出 spreadsheet ID 與（可選的）分頁 gid。
 * @param {string} url
 * @returns {{ sheetId: string, gid: string | null } | null}  無法解析時回傳 null
 */
export function parseGoogleSheetsUrl(url) {
  if (!url || !url.trim()) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const gidMatch = url.match(/[#&]gid=([0-9]+)/);
  return { sheetId: match[1], gid: gidMatch ? gidMatch[1] : null };
}

/**
 * 由分享網址組出可直接 fetch 的 CSV 匯出網址。
 * @param {string} url
 * @returns {string | null}
 */
export function buildGoogleSheetsCsvUrl(url) {
  const parsed = parseGoogleSheetsUrl(url);
  if (!parsed) return null;
  let csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/export?format=csv`;
  if (parsed.gid) csvUrl += `&gid=${parsed.gid}`;
  return csvUrl;
}

/**
 * 讀取 Google Sheets 分享網址對應的 CSV 內容（純文字）。
 * 失敗時會拋出 Error，訊息為以下其中之一：
 *   - "INVALID_URL"：網址格式不對，解析不出 spreadsheet ID
 *   - "FETCH_FAILED"：網路請求失敗（通常是權限沒開「知道連結者皆可檢視」）
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchGoogleSheetsCsv(url) {
  const csvUrl = buildGoogleSheetsCsvUrl(url);
  if (!csvUrl) throw new Error('INVALID_URL');

  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error('FETCH_FAILED');
  return response.text();
}
