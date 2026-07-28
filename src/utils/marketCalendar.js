// src/utils/marketCalendar.js
//
// 從 YieldAnalysis.jsx 抽出來的美股假期／日期驗證／年份推斷邏輯。
// 這一整組都是純函式（不依賴任何 React 狀態），適合獨立測試，也方便未來
// 其他元件（例如以後想加「交易日曆」相關功能）直接重用。

// ──────────────────────────────────────────────────────────────────────────
// 美股假期：依規則動態計算，不寫死年份清單。
// 用 NYSE 的假期規則（第 N 個星期幾 / 復活節前的耶穌受難日 / 週末補假規則）
// 即時算出任何一年的假期，並用 Map 做簡單快取，避免同一年重複計算。
// ──────────────────────────────────────────────────────────────────────────

export function nthWeekdayOfMonth(year, month, weekday, n) {
  // month: 0-indexed；weekday: 0=Sun ... 6=Sat
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

export function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

export function easterSunday(year) {
  // Anonymous Gregorian algorithm（計算西曆復活節日期）
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=三月, 4=四月
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function observedDate(date) {
  // 固定日期的假期若落在週末，比照美股慣例補假：週六提前到週五、週日順延到週一
  const day = date.getDay();
  if (day === 6) { const d = new Date(date); d.setDate(d.getDate() - 1); return d; }
  if (day === 0) { const d = new Date(date); d.setDate(d.getDate() + 1); return d; }
  return date;
}

export function formatYMD(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function computeMarketHolidaysForYear(year) {
  const goodFriday = (() => { const d = easterSunday(year); d.setDate(d.getDate() - 2); return d; })();
  return [
    observedDate(new Date(year, 0, 1)),   // 元旦
    nthWeekdayOfMonth(year, 0, 1, 3),     // 馬丁路德金紀念日：一月第三個星期一
    nthWeekdayOfMonth(year, 1, 1, 3),     // 總統日：二月第三個星期一
    goodFriday,                            // 耶穌受難日：復活節前兩天
    lastWeekdayOfMonth(year, 4, 1),        // 陣亡將士紀念日：五月最後一個星期一
    observedDate(new Date(year, 5, 19)),  // 六月節
    observedDate(new Date(year, 6, 4)),   // 獨立紀念日
    nthWeekdayOfMonth(year, 8, 1, 1),     // 勞動節：九月第一個星期一
    nthWeekdayOfMonth(year, 10, 4, 4),    // 感恩節：十一月第四個星期四
    observedDate(new Date(year, 11, 25)), // 聖誕節
  ].map(formatYMD);
}

const marketHolidayCache = new Map();
export function getMarketHolidaysForYear(year) {
  if (!marketHolidayCache.has(year)) {
    marketHolidayCache.set(year, computeMarketHolidaysForYear(year));
  }
  return marketHolidayCache.get(year);
}

export function isMarketOpen(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !getMarketHolidaysForYear(date.getFullYear()).includes(formatYMD(date));
}

// ──────────────────────────────────────────────────────────────────────────
// 日期合法性檢查：只檢查「日」落在 1~31 之間，並不代表這個日期真的存在
// （例如 2/30、4/31 都會通過那種檢查，但實際上該月根本沒有這一天）。
// JS 的 Date 物件遇到不存在的日期不會報錯，而是靜默地「進位」到下個月
// （例如 new Date(year, 1, 30) 會變成 3/2 或 3/1），資料就這樣被搬到錯的日期上，
// 而且完全沒有警告。這裡用「該月實際天數」重新驗證一次，抓出這種輸入錯誤。
// ──────────────────────────────────────────────────────────────────────────

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// 2 月先用閏年上限（29）放行，因為此時年份還沒判斷出來，
// 是否真的允許 2/29 要等 assignYearsToEntries 決定年份後才能確定（見呼叫端第二階段檢查）。
export const DAYS_IN_MONTH_LENIENT = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidCalendarDate(month, day, year) {
  if (month === 2 && day === 29) return isLeapYear(year);
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

// 標示非交易日的原因：週六/週日直接看星期幾就知道，平日的話就是剛好卡到假日
export function nonTradingDayLabel(date) {
  const day = date.getDay();
  if (day === 6) return '六';
  if (day === 0) return '日';
  return '假日';
}

// ──────────────────────────────────────────────────────────────────────────
// 年份推斷：資料只有「月/日」，需要自行判斷屬於哪一年，
// 並正確處理跨年（例如 12 月接著 1 月）的情況。
// 作法：假設資料本身依時間先後排列，從最後一筆（最新）往回推——
// 只要「前一筆」的月份大於「下一筆」的月份，就代表中間跨過了一次年底，
// 那一筆（以及更早的資料）就要算進前一年。
// ──────────────────────────────────────────────────────────────────────────

export function assignYearsToEntries(entries) {
  const n = entries.length;
  if (n === 0) return [];

  const today = new Date();
  let lastYear = today.getFullYear();

  // 若把最後一筆資料放在今年會落在「未來」（例如今天是 7 月，但最後一筆是 12/31），
  // 代表資料其實是去年的，年份要往回推一年，避免整批資料被誤判成未來日期。
  const tentativeLast = new Date(lastYear, entries[n - 1].month - 1, entries[n - 1].day);
  if (tentativeLast.getTime() > today.getTime() + 86400000) {
    lastYear -= 1;
  }

  const years = new Array(n);
  years[n - 1] = lastYear;
  for (let i = n - 2; i >= 0; i--) {
    years[i] = entries[i].month > entries[i + 1].month ? years[i + 1] - 1 : years[i + 1];
  }
  return years;
}

// 週/月/季分組用的識別碼，settlementUnit 動態切換節點密度時共用。
export function getPeriodId(date, unit) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (unit === 'month') return `${d.getFullYear()}-M${d.getMonth()}`;
  if (unit === 'quarter') return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3)}`;
  // 預設：週（ISO 週，週四為準）
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-W${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`;
}
