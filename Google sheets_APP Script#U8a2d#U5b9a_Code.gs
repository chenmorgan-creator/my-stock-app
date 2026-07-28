/**
 * ===== 投資組合寫回 Google Sheets 用的 Apps Script（加固版） =====
 *
 * 使用方式：
 * 1. 打開你的 Google Sheets → 上方選單「擴充功能」→「Apps Script」
 * 2. 把這個檔案的內容整個貼進去（取代預設的空白程式碼），存檔
 * 3. 把下面 SECRET_TOKEN 改成一組你自己的密碼字串（不要用範例的這組，建議 20 碼以上、英數混合亂數）
 * 4. 右上角「部署」→「新增部署作業」
 *    - 類型選「網頁應用程式」
 *    - 執行身分：我 (你的帳號)
 *    - 具有存取權的使用者：任何人
 *    - 點「部署」，第一次會要求你授權，照著畫面同意即可
 * 5. 部署完成後會給你一個網址，例如：
 *    https://script.google.com/macros/s/AKfycb.../exec
 *    把這個網址貼到前端網站的「設定寫回 Sheets」欄位
 *
 * 之後如果修改了這份程式碼，記得要「管理部署作業」→ 選現有部署 → 用新版本，
 * 網址才會套用最新程式碼（不然還是跑舊的）。
 *
 * ───────────────────────────────────────────────────────────
 * 這版跟原本的差異（安全性加固）：
 * 1. Token 改用固定時間比對（constant-time compare），避免用字串長度/內容差異
 *    去猜測 token 的側信道攻擊風險（雖然實務上機率很低，但屬於基本衛生習慣）。
 * 2. 加上簡單的 rate limit：同一個 token 每分鐘最多寫入 MAX_WRITES_PER_MINUTE 次，
 *    超過就直接拒絕，避免網址一旦外流被打爆、或誤觸發無窮迴圈時把 Sheet 寫爛。
 * 3. 加上 LockService，避免極端情況下兩個請求同時打進來互相干擾、寫壞資料。
 * 4. 嚴格驗證 payload：ticker 格式、shares 數值範圍、陣列長度上限，
 *    拒絕明顯不合理或過大的資料，不會被拿來塞垃圾資料或撐爆 Sheet。
 * 5. 回傳給前端的錯誤訊息改成通用訊息，內部真正的錯誤只寫進 Apps Script 的執行紀錄
 *    （Logger.log），不會把內部細節（例如程式碼結構、錯誤堆疊）洩漏給呼叫端。
 * ───────────────────────────────────────────────────────────
 */

// 🔒 請務必改成你自己的密碼字串，前端上傳時要帶一樣的 token 才會被接受
// 建議用亂數產生器（例如密碼管理工具）產生 20 碼以上的英數混合字串
const SECRET_TOKEN = 'CHANGE_ME_TO_YOUR_OWN_SECRET';

// 資料要寫在第幾欄：A欄=股票代號, B欄=股數，從第2列開始寫（第1列保留給標題）
const TICKER_COL = 1;
const SHARES_COL = 2;
const HEADER_ROW = 1;

// ── 安全性參數 ──────────────────────────────────────────────
// 同一個 token 每分鐘最多允許幾次成功寫入（超過會被拒絕，避免網址外流後被灌爆或誤觸發時寫壞資料）
const MAX_WRITES_PER_MINUTE = 10;
// 單次請求最多允許幾列資料（正常使用的持股/紀錄清單不太可能超過這個量，超過視為異常請求）
const MAX_ROWS_PER_REQUEST = 500;
// 股票代號格式：允許英數字、點號、連字號，長度 1~10（涵蓋一般美股代號與少數帶點的代號，例如 BRK.B）
const TICKER_PATTERN = /^[A-Z0-9.\-]{1,10}$/;
// 股數合理範圍上限（避免明顯異常的超大數字被寫入）
const MAX_SHARES_VALUE = 1e9;

function doPost(e) {
  // 用 LockService 確保同一時間只有一個寫入請求在執行，避免併發請求互相干擾
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000); // 最多等 10 秒拿鎖，拿不到就放棄，避免請求無限卡住
  if (!gotLock) {
    return jsonResponse({ success: false, error: '系統忙碌中，請稍後再試一次' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: '沒有收到任何資料' });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: '資料格式不正確' });
    }

    if (!constantTimeEquals(String(payload.token || ''), SECRET_TOKEN)) {
      // 🚀 即使 token 錯誤，也不透露「錯在哪裡」（長度？前幾碼對不對？），一律回同一句話
      return jsonResponse({ success: false, error: 'Token 不正確，拒絕寫入' });
    }

    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      return jsonResponse({ success: false, error: `寫入過於頻繁，請於 ${rateLimitCheck.retryAfterSeconds} 秒後再試` });
    }

    const validation = validateRows(payload.rows);
    if (!validation.ok) {
      return jsonResponse({ success: false, error: validation.error });
    }
    const rows = validation.rows;

    const sheet = getTargetSheet(payload.gid);
    if (!sheet) {
      return jsonResponse({ success: false, error: '找不到對應的分頁 (gid)' });
    }

    if (payload.mode === 'append') {
      appendRows(sheet, rows);
    } else {
      overwriteRows(sheet, rows);
    }

    recordSuccessfulWrite();

    return jsonResponse({ success: true, written: rows.length });
  } catch (err) {
    // 🚀 真正的錯誤內容只記錄在 Apps Script 執行紀錄裡（左側選單「執行項目」可查），
    // 回傳給前端的一律是通用訊息，避免洩漏內部實作細節
    Logger.log('doPost error: ' + err);
    return jsonResponse({ success: false, error: '寫入失敗，請確認部署設定或稍後再試' });
  } finally {
    lock.releaseLock();
  }
}

// 方便你直接在瀏覽器打開網址測試部署是否成功（GET 請求不會寫入任何資料）
function doGet(e) {
  return jsonResponse({ status: 'ok', message: '此端點僅接受 POST 寫入請求，GET 僅供測試部署狀態。' });
}

// ── Token 固定時間比對 ──────────────────────────────────────
// 一般字串比對（===）在字元不相符時會提早中斷，理論上可以從「回應時間差異」
// 反推出正確 token 的內容（timing attack）。這裡改成無論比對到哪都會走完全部長度，
// 讓比對時間跟輸入內容無關。同時先用雜湊統一長度，避免「輸入字串長度」本身洩漏資訊。
function constantTimeEquals(a, b) {
  const hashA = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  const hashB = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);

  let diff = 0;
  for (let i = 0; i < hashA.length; i++) {
    diff |= hashA[i] ^ hashB[i];
  }
  return diff === 0;
}

// ── Rate limit：用 CacheService 記錄「這一分鐘內已經寫入幾次」 ──────────
function checkRateLimit() {
  const cache = CacheService.getScriptCache();
  const bucketKey = 'write_count_' + Math.floor(Date.now() / 60000); // 以「這一分鐘」為單位的桶
  const current = Number(cache.get(bucketKey) || '0');

  if (current >= MAX_WRITES_PER_MINUTE) {
    const secondsIntoBucket = Math.floor((Date.now() / 1000) % 60);
    return { allowed: false, retryAfterSeconds: 60 - secondsIntoBucket };
  }
  return { allowed: true };
}

function recordSuccessfulWrite() {
  const cache = CacheService.getScriptCache();
  const bucketKey = 'write_count_' + Math.floor(Date.now() / 60000);
  const current = Number(cache.get(bucketKey) || '0');
  // 桶子存活 70 秒（比 60 秒的分鐘桶多留一點緩衝），時間到會自動過期，不用手動清理
  cache.put(bucketKey, String(current + 1), 70);
}

// ── Payload 驗證：格式、範圍、數量上限都檢查過，才允許真正寫入 Sheet ──────
function validateRows(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { ok: false, error: '沒有可寫入的資料' };
  }
  if (rawRows.length > MAX_ROWS_PER_REQUEST) {
    return { ok: false, error: `單次最多只能寫入 ${MAX_ROWS_PER_REQUEST} 筆資料，請減少資料量後再試` };
  }

  const cleanRows = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || typeof row.ticker !== 'string') {
      return { ok: false, error: `第 ${i + 1} 筆資料的股票代號格式不正確` };
    }

    const ticker = row.ticker.trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      return { ok: false, error: `第 ${i + 1} 筆資料的股票代號「${row.ticker}」格式不正確` };
    }

    const shares = Number(row.shares);
    if (!isFinite(shares) || isNaN(shares) || shares < 0 || shares > MAX_SHARES_VALUE) {
      return { ok: false, error: `第 ${i + 1} 筆資料（${ticker}）的股數不合法` };
    }

    cleanRows.push({ ticker: ticker, shares: shares });
  }

  return { ok: true, rows: cleanRows };
}

function getTargetSheet(gid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (gid) {
    const match = ss.getSheets().find(s => String(s.getSheetId()) === String(gid));
    if (match) return match;
  }
  // 沒指定 gid，或找不到對應分頁時，預設寫入第一個分頁
  return ss.getSheets()[0];
}

// 覆蓋模式：清空既有資料（保留標題列），整批寫入最新的持股清單
function overwriteRows(sheet, rows) {
  const lastRow = sheet.getLastRow();
  if (lastRow > HEADER_ROW) {
    sheet.getRange(HEADER_ROW + 1, TICKER_COL, lastRow - HEADER_ROW, 2).clearContent();
  }
  const values = rows.map(r => [r.ticker, r.shares]);
  sheet.getRange(HEADER_ROW + 1, TICKER_COL, values.length, 2).setValues(values);
}

// 新增模式：每次上傳都在最後面加新的一批，並附上時間戳記，方便保留歷史紀錄
function appendRows(sheet, rows) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const startRow = sheet.getLastRow() + 1;
  const values = rows.map(r => [r.ticker, r.shares, timestamp]);
  sheet.getRange(startRow, TICKER_COL, values.length, 3).setValues(values);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
