// src/utils/ocr/ocrParsing.js
//
// 從 FrontendOcrTest.jsx 抽出來的 OCR 結果解析邏輯：把 tesseract.js 回傳的原始資料
// 轉換成表格可用的 { ticker, shares } 列表。純函式，不依賴任何 React 狀態。

const HEADER_WORDS = new Set([
  'TICKER', 'SYMBOL', 'SHARES', 'QTY', 'QUANTITY', 'PRICE',
  'VALUE', 'TOTAL', 'AVG', 'COST', 'GAIN', 'LOSS', 'PORTFOLIO',
  'HOLDINGS', 'STOCK', 'STOCKS', 'MARKET', 'CHANGE', 'TODAY'
]);

// 🚀 信心值過低（<80）標記為需要人工核對，避免像 6→4 這類極小字體誤判被使用者忽略
const LOW_CONFIDENCE_THRESHOLD = 80;

// 🚀 新版 Tesseract.js 預設不回傳扁平的 data.words，要從巢狀的 blocks 結構裡自己攤平出來
export function flattenWordsFromBlocks(blocks) {
  const words = [];
  (blocks || []).forEach(block => {
    (block.paragraphs || []).forEach(para => {
      (para.lines || []).forEach(line => {
        (line.words || []).forEach(word => {
          words.push(word);
        });
      });
    });
  });
  return words;
}

// 🚀 依照文字方塊的座標位置，把 OCR 結果重組成一列一列（比單純用換行符號穩定很多）
export function groupWordsIntoRows(words) {
  if (!words || words.length === 0) return [];

  const items = words
    .filter(w => w.text && w.text.trim().length > 0)
    .map(w => ({
      text: w.text.trim(),
      x: w.bbox.x0,
      yCenter: (w.bbox.y0 + w.bbox.y1) / 2,
      height: Math.max(w.bbox.y1 - w.bbox.y0, 1),
      confidence: typeof w.confidence === 'number' ? w.confidence : 100
    }))
    .sort((a, b) => a.yCenter - b.yCenter);

  const avgHeight = items.reduce((s, w) => s + w.height, 0) / items.length;
  const rowGap = avgHeight * 0.7;

  const rows = [];
  let currentRow = [];
  let runningY = null;

  for (const word of items) {
    if (runningY === null || Math.abs(word.yCenter - runningY) <= rowGap) {
      currentRow.push(word);
      runningY = currentRow.reduce((s, w) => s + w.yCenter, 0) / currentRow.length;
    } else {
      rows.push(currentRow);
      currentRow = [word];
      runningY = word.yCenter;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows.map(row => row.sort((a, b) => a.x - b.x));
}

// 🚀 把 tesseract.js 回傳的原始資料（result.data）解析成表格列（ticker/shares），
// 標記信心值過低需要人工核對的欄位，並去除重複代號（保留第一次出現的辨識結果）。
// 回傳 { rows, lowConfidenceCount }。
export function parseOcrDataToPortfolioRows(ocrData) {
  const words = ocrData.words || flattenWordsFromBlocks(ocrData.blocks);
  const rows = groupWordsIntoRows(words);
  const parsedRows = [];

  for (const row of rows) {
    let ticker = null;
    let tickerIdx = -1;

    for (let i = 0; i < row.length; i++) {
      const token = row[i].text.toUpperCase().replace(/[^A-Z]/g, '');
      if (token.length >= 2 && token.length <= 5 && !HEADER_WORDS.has(token)) {
        ticker = token;
        tickerIdx = i;
        break;
      }
    }

    if (!ticker) continue;
    const tickerConfidence = row[tickerIdx].confidence;

    let shares = null;
    let sharesConfidence = null;
    for (let i = tickerIdx + 1; i < row.length; i++) {
      const rawToken = row[i].text.replace(/[$,]/g, '');
      if (/^\d+$/.test(rawToken)) {
        shares = rawToken;
        sharesConfidence = row[i].confidence;
        break;
      }
    }
    if (shares === null) {
      for (let i = tickerIdx + 1; i < row.length; i++) {
        const rawToken = row[i].text.replace(/[$,]/g, '');
        if (/^\d+(\.\d+)?$/.test(rawToken)) {
          shares = String(Math.round(parseFloat(rawToken)));
          sharesConfidence = row[i].confidence;
          break;
        }
      }
    }

    parsedRows.push({
      ticker,
      shares: shares || "",
      tickerLowConfidence: tickerConfidence < LOW_CONFIDENCE_THRESHOLD,
      sharesLowConfidence: shares !== null && sharesConfidence < LOW_CONFIDENCE_THRESHOLD,
      tickerConfidence,
      sharesConfidence
    });
  }

  // 去除重複代號，保留第一次出現的辨識結果
  const seen = new Set();
  const dedupedRows = parsedRows.filter(row => {
    if (seen.has(row.ticker)) return false;
    seen.add(row.ticker);
    return true;
  });

  const lowConfidenceCount = dedupedRows.filter(r => r.tickerLowConfidence || r.sharesLowConfidence).length;

  return { rows: dedupedRows, lowConfidenceCount };
}
