import { useMemo, useState, useEffect } from 'react';
import { fetchGoogleSheetsCsv } from '../../utils/googleSheets';
import {
  DAYS_IN_MONTH_LENIENT,
  isValidCalendarDate,
  nonTradingDayLabel,
  assignYearsToEntries,
  isMarketOpen,
  getPeriodId,
} from '../../utils/marketCalendar';
import { computeNiceAxis } from '../../utils/chartAxis';
import SheetBackedDataHeader from './SheetBackedDataHeader';
import YieldCurveChart from './YieldCurveChart';
import AccountValueChart from './AccountValueChart';

// 💡 可以在此處直接寫死您的專屬 Google Sheets 網址，系統會以此為絕對優先預設值
const DEFAULT_GOOGLE_SHEET_URL = "";

const DEFAULT_DATA = `1/1 0.0%\n1/2 6.0%\n1/5 7.6%\n1/6 11.8%\n1/7 11.8%\n1/8 11.1%\n1/9 15.2%\n1/12 17.3%\n1/13 20.5%\n1/14 18.3%\n1/15 19.9%\n1/16 20.2%\n1/20 22.9%\n1/21 24.1%\n1/22 26.2%\n1/23 24.9%\n1/26 22.3%\n1/27 28.5%\n1/28 31.2%\n1/29 26.4%\n1/30 22.5%\n2/2 32.1%\n2/3 34.3%\n2/4 13.0%\n2/5 12.9%\n2/6 21.4%\n2/9 26.4%\n2/10 16.4%\n2/11 22.7%\n2/12 18.3%\n2/13 17.6%\n2/17 16.9%\n2/18 22.1%\n2/19 25.4%\n2/20 29.3%\n2/23 30.2%\n2/24 36.5%\n2/25 42.0%\n2/26 36.1%\n2/27 30.5%\n3/2 43.6%\n3/3 27.2%\n3/4 35.2%\n3/5 28.9%\n3/6 12.1%\n3/9 22.6%\n3/10 26.2%\n3/11 31.3%\n3/12 22.6%\n3/13 23.8%\n3/16 30.2%\n3/17 32.8%\n3/18 33.4%\n3/19 39.8%\n3/20 24.5%\n3/23 32.4%\n3/24 35.9%\n3/25 38.8%\n3/26 13.8%\n3/27 13.1%\n3/30 -2.2%\n3/31 4.5%\n4/1 3.9%\n4/2 4.4%\n4/6 0.0%\n4/7 0.8%\n4/8 12.2%\n4/9 17.1%\n4/10 18.5%\n4/13 26.8%\n4/14 34.4%\n4/15 31.1%\n4/16 39.7%\n4/17 40.8%\n4/20 40.9%\n4/21 36.9%\n4/22 52.9%\n4/23 44.7%\n4/24 48.8%\n4/27 53.3%\n4/28 43.6%\n4/29 54.6%\n4/30 59.9%\n5/1 69.3%`;

const YIELD_STORAGE_KEY = 'yieldInputTextBackup';
const ACCOUNT_STORAGE_KEY = 'accountValueTextBackup';

const YIELD_DATA_SOURCE_BADGES = {
  Hardcoded: { label: '內建數據', className: 'bg-amber-100 text-amber-700' },
  Manual: { label: '手動輸入', className: 'bg-emerald-100 text-emerald-700' },
  'Google Sheets': { label: '預設 Google 雲端試算表', className: 'bg-blue-100 text-blue-700' },
  'Local Backup': { label: '本機備份', className: 'bg-slate-200 text-slate-600' },
};

const ACCOUNT_DATA_SOURCE_BADGES = {
  Empty: { label: '尚未輸入資料', className: 'bg-slate-100 text-slate-500' },
  Manual: { label: '手動輸入', className: 'bg-emerald-100 text-emerald-700' },
  'Google Sheets': { label: '預設 Google 雲端試算表', className: 'bg-blue-100 text-blue-700' },
  'Local Backup': { label: '本機備份', className: 'bg-slate-200 text-slate-600' },
};

export default function YieldAnalysis() {
  const [inputText, setInputText] = useState(DEFAULT_DATA);
  const [showInput, setShowInput] = useState(false);
  const [showSheetInput, setShowSheetInput] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [dataSource, setDataSource] = useState("Hardcoded");

  const [timeRange, setTimeRange] = useState("YTD");

  // 🚀 累積報酬率 vs 期間報酬率：預設是「累積」（跟原本行為一致，相對固定起點算），
  // 選「期間」時，會把目前選取的時間範圍起點重新當作 0% 基準，只看這段時間單獨的漲跌。
  const [returnMode, setReturnMode] = useState('cumulative');

  // 🚀 圖表上的節點密度（週/月）依「模式 + 時間範圍」動態調整，不再固定用「週」。
  // 固定用週節點在短區間沒問題，但長區間會擠出一堆標籤疊在一起，反而不好讀。
  const settlementUnit = useMemo(() => {
    if (returnMode === 'period') {
      if (timeRange === '1W' || timeRange === '1M' || timeRange === 'MTD') return 'week';
      return 'month'; // 3M, 6M, YTD, 1Y
    }
    if (timeRange === 'YTD' || timeRange === '1Y') return 'month';
    return 'week'; // 1W, 1M, MTD, 3M, 6M
  }, [returnMode, timeRange]);

  // 🚀 本機自動備份：inputText（無論來源是 Google Sheets、手動輸入還是內建範例）
  // 都會自動存一份到瀏覽器 localStorage，重新整理不會遺失。
  const [isLoaded, setIsLoaded] = useState(false);

  // ────────────────────────────────────────────────────────────────────────
  // 帳戶總值走勢圖：跟收益曲線是獨立的一組資料。收益率是「報酬率 %」，
  // 這裡記的是「每天的帳戶總值（美元）」。
  // ────────────────────────────────────────────────────────────────────────
  const [accountText, setAccountText] = useState("");
  const [showAccountInput, setShowAccountInput] = useState(false);
  const [showAccountSheetInput, setShowAccountSheetInput] = useState(false);
  const [accountSheetUrl, setAccountSheetUrl] = useState("");
  const [isFetchingAccountSheet, setIsFetchingAccountSheet] = useState(false);
  const [accountStatusMsg, setAccountStatusMsg] = useState("");
  const [accountDataSource, setAccountDataSource] = useState("Empty");
  const [accountTimeRange, setAccountTimeRange] = useState("YTD");
  const [isAccountLoaded, setIsAccountLoaded] = useState(false);

  useEffect(() => {
    const savedUrl = localStorage.getItem('savedYieldSheetUrl') || DEFAULT_GOOGLE_SHEET_URL;
    const savedText = localStorage.getItem(YIELD_STORAGE_KEY);

    if (savedUrl && savedUrl.trim() !== "") {
      setSheetUrl(savedUrl);
      // 先把本機備份的資料顯示出來，避免連線抓取期間畫面空白；
      // 抓取成功後會被最新的 Google Sheets 資料覆蓋過去。
      if (savedText && savedText.trim() !== "") {
        setInputText(savedText);
        setDataSource("Local Backup");
      }
      handleFetchGoogleSheets(savedUrl, true);
    } else if (savedText && savedText.trim() !== "") {
      setInputText(savedText);
      setDataSource("Local Backup");
      setStatusMsg("✅ 已從本機備份恢復先前的收益資料。");
    }

    setIsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每次 inputText 變動就自動備份到本機，用 isLoaded 擋掉掛載當下那一次渲染，
  // 避免用初始的 DEFAULT_DATA 把已經存在本機的備份蓋掉。
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(YIELD_STORAGE_KEY, inputText);
    } catch (error) {
      console.error(error);
    }
  }, [inputText, isLoaded]);

  useEffect(() => {
    const savedUrl = localStorage.getItem('savedAccountSheetUrl') || "";
    const savedText = localStorage.getItem(ACCOUNT_STORAGE_KEY);

    if (savedUrl && savedUrl.trim() !== "") {
      setAccountSheetUrl(savedUrl);
      if (savedText && savedText.trim() !== "") {
        setAccountText(savedText);
        setAccountDataSource("Local Backup");
      }
      handleFetchAccountSheets(savedUrl, true);
    } else if (savedText && savedText.trim() !== "") {
      setAccountText(savedText);
      setAccountDataSource("Local Backup");
      setAccountStatusMsg("✅ 已從本機備份恢復先前的帳戶總值資料。");
    }

    setIsAccountLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAccountLoaded) return;
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, accountText);
    } catch (error) {
      console.error(error);
    }
  }, [accountText, isAccountLoaded]);

  const handleFetchGoogleSheets = async (targetUrl = sheetUrl, isAuto = false) => {
    if (!targetUrl.trim()) return;
    if (!isAuto) setIsFetchingSheet(true);
    setStatusMsg(isAuto ? "⏳ 正在自動同步預設 Google Sheets 數據..." : "⏳ 正在連線至 Google Sheets...");

    try {
      const csvText = await fetchGoogleSheetsCsv(targetUrl);

      const parsedLines = csvText.split(/\r?\n/).map(line => {
        const cols = line.split(',');
        if (cols.length >= 2) {
          const date = cols[0].replace(/['"]/g, '').trim();
          const yieldVal = cols[1].replace(/['"]/g, '').trim();
          if (!date || !yieldVal || date.toLowerCase() === 'date' || yieldVal.toLowerCase().includes('yield')) return null;
          return `${date} ${yieldVal}`;
        }
        return null;
      }).filter(Boolean);

      if (parsedLines.length === 0) {
        setStatusMsg("⚠️ 檔案讀取成功，但未解析到有效數據。");
      } else {
        setInputText(parsedLines.join('\n'));
        setDataSource("Google Sheets");
        setStatusMsg(`✅ 成功從雲端同步 ${parsedLines.length} 筆最新收益數據！`);

        localStorage.setItem('savedYieldSheetUrl', targetUrl);
        setSheetUrl(targetUrl);
        setShowSheetInput(false);
      }
    } catch (error) {
      console.error(error);
      if (error.message === 'INVALID_URL') {
        setStatusMsg("❌ 無效的 Google Sheets 連結，請確認網址格式是否完整。");
      } else {
        setStatusMsg("❌ 讀取失敗！請確認試算表共用權限已設定為「知道連結的使用者皆可檢視」。");
      }
    } finally {
      if (!isAuto) setIsFetchingSheet(false);
    }
  };

  // 🚀 讓使用者可以主動清掉本機備份（例如已經改用 Google Sheets 當唯一來源，不想留一份舊備份）
  const handleClearLocalBackup = () => {
    if (!window.confirm('確定要清空本機備份的收益資料嗎？此動作不會影響 Google Sheets 上的資料，但無法復原本機這份備份。')) return;
    try {
      localStorage.removeItem(YIELD_STORAGE_KEY);
    } catch (error) {
      console.error(error);
    }
    setStatusMsg('🗑️ 已清空本機備份。');
  };

  const handleFetchAccountSheets = async (targetUrl = accountSheetUrl, isAuto = false) => {
    if (!targetUrl.trim()) return;
    if (!isAuto) setIsFetchingAccountSheet(true);
    setAccountStatusMsg(isAuto ? "⏳ 正在自動同步預設 Google Sheets 帳戶總值數據..." : "⏳ 正在連線至 Google Sheets...");

    try {
      const csvText = await fetchGoogleSheetsCsv(targetUrl);

      const parsedLines = csvText.split(/\r?\n/).map(line => {
        const cols = line.split(',');
        // 🚀 帳戶總值放在 C 欄（索引 2），不是 B 欄——日期在 A 欄，B 欄可能是其他資料（例如市值、備註）不使用。
        if (cols.length >= 3) {
          const date = cols[0].replace(/['"]/g, '').trim();
          const value = cols[2].replace(/['"]/g, '').trim();
          if (!date || !value || date.toLowerCase() === 'date' || /[a-z]/i.test(value.replace(/[$,.\s-]/g, ''))) return null;
          return `${date} ${value}`;
        }
        return null;
      }).filter(Boolean);

      if (parsedLines.length === 0) {
        setAccountStatusMsg("⚠️ 檔案讀取成功，但未解析到有效數據。");
      } else {
        setAccountText(parsedLines.join('\n'));
        setAccountDataSource("Google Sheets");
        setAccountStatusMsg(`✅ 成功從雲端同步 ${parsedLines.length} 筆最新帳戶總值數據！`);

        localStorage.setItem('savedAccountSheetUrl', targetUrl);
        setAccountSheetUrl(targetUrl);
        setShowAccountSheetInput(false);
      }
    } catch (error) {
      console.error(error);
      if (error.message === 'INVALID_URL') {
        setAccountStatusMsg("❌ 無效的 Google Sheets 連結，請確認網址格式是否完整。");
      } else {
        setAccountStatusMsg("❌ 讀取失敗！請確認試算表共用權限已設定為「知道連結的使用者皆可檢視」。");
      }
    } finally {
      if (!isAuto) setIsFetchingAccountSheet(false);
    }
  };

  const handleClearAccountBackup = () => {
    if (!window.confirm('確定要清空本機備份的帳戶總值資料嗎？此動作不會影響 Google Sheets 上的資料，但無法復原本機這份備份。')) return;
    try {
      localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    } catch (error) {
      console.error(error);
    }
    setAccountStatusMsg('🗑️ 已清空本機備份。');
  };

  const processedData = useMemo(() => {
    const textToParse = inputText || DEFAULT_DATA;
    const lines = textToParse.trim().split('\n').filter(l => l.trim() !== '');

    let skippedStage1 = 0;
    const rawEntries = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) return null;
      const dateStr = parts[0];
      const val = parseFloat(parts[1].replace('%', ''));
      if (isNaN(val) || !dateStr.includes('/')) return null;
      const [m, d] = dateStr.split('/').map(Number);
      if (!m || !d || m < 1 || m > 12 || d < 1) return null;
      // 🚀 先用閏年上限擋掉明顯不存在的日期（例如 2/30、4/31），
      // 2/29 是否合法要等年份確定後才知道，這裡先放行，交給下面第二階段判斷。
      if (d > DAYS_IN_MONTH_LENIENT[m - 1]) { skippedStage1++; return null; }
      return { date: dateStr, percentage: val, month: m, day: d };
    }).filter(Boolean);

    const years = assignYearsToEntries(rawEntries);

    // 🚀 第二階段：年份確定後，重新驗證每個日期是否真的存在（主要是抓平年的 2/29），
    // 同時確認資料是不是照時間先後排序、有沒有重複日期。
    const parsed = [];
    let prevTime = -Infinity;
    let outOfOrder = false;
    const nonTradingDayEntries = [];
    const seenDates = new Set();
    const duplicateDates = [];
    for (let i = 0; i < rawEntries.length; i++) {
      const item = rawEntries[i];
      const year = years[i];
      if (!isValidCalendarDate(item.month, item.day, year)) continue;
      const t = new Date(year, item.month - 1, item.day).getTime();
      if (t < prevTime) outOfOrder = true;
      prevTime = t;
      if (seenDates.has(t)) {
        duplicateDates.push(item.date);
      } else {
        seenDates.add(t);
      }
      // 🚀 1/1（元旦）例外：不管哪一年都跳過這個警告——1/1 每年一定是假日，常被用來當作
      // 「這一年報酬率從 0% 開始算」的基準點，本身不代表任何一天的實際交易結果。
      if (!(item.month === 1 && item.day === 1) && !isMarketOpen(new Date(t))) {
        nonTradingDayEntries.push(`${item.date}(${nonTradingDayLabel(new Date(t))})`);
      }
      parsed.push({ date: item.date, percentage: item.percentage, dateObj: new Date(t) });
    }
    const skippedInvalidDates = skippedStage1 + (rawEntries.length - parsed.length);

    // 🚀 每種分組單位的最大天數跨度不同（週最多 6 天、月最多 31 天、季最多 95 天）
    const maxOffsetByUnit = { week: 6, month: 31, quarter: 95 };
    const maxOffset = maxOffsetByUnit[settlementUnit] || 6;

    const withSettlement = parsed.map((item, i, arr) => {
      const checkDate = new Date(item.dateObj);
      const periodId = getPeriodId(checkDate, settlementUnit);
      let isSettlement = true;
      let nextDay = new Date(checkDate);
      for (let offset = 1; offset <= maxOffset; offset++) {
        nextDay.setDate(nextDay.getDate() + 1);
        if (getPeriodId(nextDay, settlementUnit) !== periodId) break;
        if (isMarketOpen(nextDay)) { isSettlement = false; break; }
      }
      if (isSettlement && i < arr.length - 1) {
        if (getPeriodId(arr[i + 1].dateObj, settlementUnit) === periodId) isSettlement = false;
      }
      return { ...item, isLastDay: isSettlement };
    });

    withSettlement.skippedInvalidDates = skippedInvalidDates;
    withSettlement.outOfOrder = outOfOrder;
    withSettlement.nonTradingDayEntries = nonTradingDayEntries;
    withSettlement.duplicateDates = duplicateDates;
    return withSettlement;
  }, [inputText, settlementUnit]);

  // 手動編輯資料時，若格式打錯導致 0 筆有效資料，明確提示使用者，
  // 而不是讓圖表默默地變成空白，讓人搞不清楚是資料錯了還是系統壞了。
  const parseWarning = useMemo(() => {
    const trimmed = (inputText || '').trim();
    if (trimmed !== '' && processedData.length === 0) {
      return "⚠️ 找不到有效資料，請確認每行格式為「月/日 數字%」，例如：1/5 7.6%";
    }
    const issues = [];
    if (processedData.skippedInvalidDates > 0) {
      issues.push(`有 ${processedData.skippedInvalidDates} 筆資料的日期實際上不存在（例如 2/30、4/31），已自動略過`);
    }
    if (processedData.outOfOrder) {
      issues.push('偵測到資料日期不是照時間先後排序，年份判斷可能不準確，建議確認輸入順序');
    }
    if (processedData.nonTradingDayEntries && processedData.nonTradingDayEntries.length > 0) {
      issues.push(`以下資料落在非交易日，已保留但請確認是否為誤植：${processedData.nonTradingDayEntries.join('、')}`);
    }
    if (processedData.duplicateDates && processedData.duplicateDates.length > 0) {
      issues.push(`以下日期出現重複資料，已保留但請確認是否為誤貼：${processedData.duplicateDates.join('、')}`);
    }
    return issues.length > 0 ? `⚠️ ${issues.join('；')}。` : '';
  }, [inputText, processedData]);

  const filteredData = useMemo(() => {
    if (processedData.length === 0) return [];

    const latestTime = Math.max(...processedData.map(d => d.dateObj.getTime()));
    const latestDate = new Date(latestTime);

    return processedData.filter(item => {
      const itemTime = item.dateObj.getTime();

      if (timeRange === "1W") {
        const cutoff = new Date(latestDate);
        cutoff.setDate(cutoff.getDate() - 7);
        return itemTime >= cutoff.getTime();
      }
      if (timeRange === "1M") {
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - 1);
        return itemTime >= cutoff.getTime();
      }
      if (timeRange === "3M") {
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - 3);
        return itemTime >= cutoff.getTime();
      }
      if (timeRange === "6M") {
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - 6);
        return itemTime >= cutoff.getTime();
      }
      if (timeRange === "1Y") {
        const cutoff = new Date(latestDate);
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        return itemTime >= cutoff.getTime();
      }
      if (timeRange === "YTD") {
        const cutoff = new Date(latestDate.getFullYear(), 0, 1);
        return itemTime >= cutoff.getTime();
      }
      if (timeRange === "MTD") {
        const cutoff = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
        return itemTime >= cutoff.getTime();
      }
      return true;
    });
  }, [processedData, timeRange]);

  // 🚀 期間報酬率的基準值：預設用目前範圍第一筆資料的百分比。
  // MTD 是特例——基準改用「上個月最後一筆資料」的百分比（如果有的話）。
  const periodBaseline = useMemo(() => {
    if (filteredData.length === 0) return 0;
    if (timeRange === "MTD") {
      const monthStart = new Date(
        filteredData[0].dateObj.getFullYear(),
        filteredData[0].dateObj.getMonth(),
        1
      ).getTime();
      const priorEntries = processedData.filter(d => d.dateObj.getTime() < monthStart);
      if (priorEntries.length > 0) {
        const anchor = priorEntries.reduce((latest, d) =>
          d.dateObj.getTime() > latest.dateObj.getTime() ? d : latest
        );
        return anchor.percentage;
      }
    }
    return filteredData[0].percentage;
  }, [filteredData, processedData, timeRange]);

  // 🚀 期間報酬率：把目前時間範圍的起點重新當作 0% 基準，只看這段區間單獨的漲跌。
  // 用正確的複利換算公式重新歸零，不是單純相減。
  const displayData = useMemo(() => {
    if (returnMode !== 'period' || filteredData.length === 0) return filteredData;
    const baseline = periodBaseline;
    return filteredData.map(item => ({
      ...item,
      percentage: Math.round((((1 + item.percentage / 100) / (1 + baseline / 100) - 1) * 100) * 100) / 100,
    }));
  }, [filteredData, returnMode, periodBaseline]);

  // 🚀 只有在「最後一天本身不是結算節點」的時候，圖上才會真的畫出琥珀色的最新資料點
  const hasDistinctLatestDot = useMemo(() => {
    if (displayData.length === 0) return false;
    const lastIndex = displayData.length - 1;
    const lastItem = displayData[lastIndex];
    const isSettlementNode = lastItem.isLastDay && lastIndex !== 0;
    return !isSettlementNode;
  }, [displayData]);

  const yAxisConfig = useMemo(() => {
    if (displayData.length === 0) return { ticks: [0, 20, 40], domain: [0, 40] };
    const allVals = displayData.map(d => d.percentage);
    return computeNiceAxis(Math.min(...allVals), Math.max(...allVals));
  }, [displayData]);

  // 資料筆數變多時 X 軸標籤會擠成一團，這裡依資料量動態跳號，
  // 讓畫面上最多只顯示約 20 個日期標籤（線本身仍會畫出全部的點）。
  const xAxisInterval = useMemo(() => {
    if (displayData.length <= 20) return 0;
    return Math.ceil(displayData.length / 20) - 1;
  }, [displayData]);

  // ────────────────────────────────────────────────────────────────────────
  // 帳戶總值走勢圖：解析邏輯跟收益曲線幾乎一樣，差別只在數值代表的是美元金額，
  // 也允許輸入時帶 $ 符號跟千分位逗號（例如 $125,340），解析時會自動去除。
  // ────────────────────────────────────────────────────────────────────────

  const processedAccountData = useMemo(() => {
    const lines = (accountText || '').trim().split('\n').filter(l => l.trim() !== '');

    let skippedStage1 = 0;
    const rawEntries = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) return null;
      const dateStr = parts[0];
      const valueStr = parts.slice(1).join(' ').replace(/[$,]/g, '');
      const val = parseFloat(valueStr);
      if (isNaN(val) || !dateStr.includes('/')) return null;
      const [m, d] = dateStr.split('/').map(Number);
      if (!m || !d || m < 1 || m > 12 || d < 1) return null;
      if (d > DAYS_IN_MONTH_LENIENT[m - 1]) { skippedStage1++; return null; }
      return { date: dateStr, value: val, month: m, day: d };
    }).filter(Boolean);

    const years = assignYearsToEntries(rawEntries);

    const parsed = [];
    let prevTime = -Infinity;
    let outOfOrder = false;
    const nonTradingDayEntries = [];
    const seenDates = new Set();
    const duplicateDates = [];
    for (let i = 0; i < rawEntries.length; i++) {
      const item = rawEntries[i];
      const year = years[i];
      if (!isValidCalendarDate(item.month, item.day, year)) continue;
      const t = new Date(year, item.month - 1, item.day).getTime();
      if (t < prevTime) outOfOrder = true;
      prevTime = t;
      if (seenDates.has(t)) {
        duplicateDates.push(item.date);
      } else {
        seenDates.add(t);
      }
      if (!(item.month === 1 && item.day === 1) && !isMarketOpen(new Date(t))) {
        nonTradingDayEntries.push(`${item.date}(${nonTradingDayLabel(new Date(t))})`);
      }
      parsed.push({ date: item.date, value: item.value, dateObj: new Date(t) });
    }

    parsed.skippedInvalidDates = skippedStage1 + (rawEntries.length - parsed.length);
    parsed.outOfOrder = outOfOrder;
    parsed.nonTradingDayEntries = nonTradingDayEntries;
    parsed.duplicateDates = duplicateDates;
    return parsed;
  }, [accountText]);

  const accountParseWarning = useMemo(() => {
    const trimmed = (accountText || '').trim();
    if (trimmed !== '' && processedAccountData.length === 0) {
      return "⚠️ 找不到有效資料，請確認每行格式為「月/日 金額」，例如：1/5 125340 或 1/5 $125,340";
    }
    const issues = [];
    if (processedAccountData.skippedInvalidDates > 0) {
      issues.push(`有 ${processedAccountData.skippedInvalidDates} 筆資料的日期實際上不存在（例如 2/30、4/31），已自動略過`);
    }
    if (processedAccountData.outOfOrder) {
      issues.push('偵測到資料日期不是照時間先後排序，年份判斷可能不準確，建議確認輸入順序');
    }
    if (processedAccountData.nonTradingDayEntries && processedAccountData.nonTradingDayEntries.length > 0) {
      issues.push(`以下資料落在非交易日，已保留但請確認是否為誤植：${processedAccountData.nonTradingDayEntries.join('、')}`);
    }
    if (processedAccountData.duplicateDates && processedAccountData.duplicateDates.length > 0) {
      issues.push(`以下日期出現重複資料，已保留但請確認是否為誤貼：${processedAccountData.duplicateDates.join('、')}`);
    }
    if (issues.length > 0) return `⚠️ ${issues.join('；')}。`;
    return "";
  }, [accountText, processedAccountData]);

  const filteredAccountData = useMemo(() => {
    if (processedAccountData.length === 0) return [];

    const latestTime = Math.max(...processedAccountData.map(d => d.dateObj.getTime()));
    const latestDate = new Date(latestTime);

    return processedAccountData.filter(item => {
      const itemTime = item.dateObj.getTime();

      if (accountTimeRange === "1W") {
        const cutoff = new Date(latestDate);
        cutoff.setDate(cutoff.getDate() - 7);
        return itemTime >= cutoff.getTime();
      }
      if (accountTimeRange === "1M") {
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - 1);
        return itemTime >= cutoff.getTime();
      }
      if (accountTimeRange === "3M") {
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - 3);
        return itemTime >= cutoff.getTime();
      }
      if (accountTimeRange === "6M") {
        const cutoff = new Date(latestDate);
        cutoff.setMonth(cutoff.getMonth() - 6);
        return itemTime >= cutoff.getTime();
      }
      if (accountTimeRange === "1Y") {
        const cutoff = new Date(latestDate);
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        return itemTime >= cutoff.getTime();
      }
      if (accountTimeRange === "YTD") {
        const cutoff = new Date(latestDate.getFullYear(), 0, 1);
        return itemTime >= cutoff.getTime();
      }
      if (accountTimeRange === "MTD") {
        const cutoff = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
        return itemTime >= cutoff.getTime();
      }
      return true;
    });
  }, [processedAccountData, accountTimeRange]);

  const accountYAxisConfig = useMemo(() => {
    if (filteredAccountData.length === 0) return { ticks: [0, 50000, 100000], domain: [0, 100000] };
    const allVals = filteredAccountData.map(d => d.value);
    return computeNiceAxis(Math.min(...allVals), Math.max(...allVals));
  }, [filteredAccountData]);

  const accountXAxisInterval = useMemo(() => {
    if (filteredAccountData.length <= 20) return 0;
    return Math.ceil(filteredAccountData.length / 20) - 1;
  }, [filteredAccountData]);

  // 資料點很多時每個點都畫圓點反而會擠成一片，這時候關掉逐點的圓點，只靠 Tooltip 看數值。
  const accountShowDots = filteredAccountData.length <= 60;

  // 🚀 節點旁邊的文字標籤，依目前的 settlementUnit 顯示對應的週期用字
  const settlementUnitLabel = { week: '週', month: '月', quarter: '季' }[settlementUnit] || '';

  return (
    <div className="font-sans text-slate-900 w-full mt-4">
      <div className="max-w-6xl mx-auto space-y-8">

        <SheetBackedDataHeader
          title="美股收益分析系統"
          dataSource={dataSource}
          dataSourceBadges={YIELD_DATA_SOURCE_BADGES}
          statusMsg={statusMsg}
          showSheetInput={showSheetInput}
          onToggleSheetInput={() => { setShowSheetInput(!showSheetInput); setShowInput(false); }}
          sheetUrl={sheetUrl}
          onChangeSheetUrl={setSheetUrl}
          onFetchSheet={handleFetchGoogleSheets}
          isFetchingSheet={isFetchingSheet}
          showInput={showInput}
          onToggleInput={() => { setShowInput(!showInput); setShowSheetInput(false); }}
          textareaLabel="Data Editor (請輸入：日期 收益率)"
          textareaValue={inputText}
          onChangeTextarea={(val) => { setInputText(val); setDataSource("Manual"); }}
          parseWarning={parseWarning}
          accent="indigo"
          onClearBackup={handleClearLocalBackup}
          clearBackupTitle="清空本機備份的收益資料（不影響 Google Sheets）"
        />

        <YieldCurveChart
          displayData={displayData}
          yAxisConfig={yAxisConfig}
          xAxisInterval={xAxisInterval}
          hasDistinctLatestDot={hasDistinctLatestDot}
          settlementUnit={settlementUnit}
          settlementUnitLabel={settlementUnitLabel}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          returnMode={returnMode}
          setReturnMode={setReturnMode}
          parseWarning={parseWarning}
        />

        <SheetBackedDataHeader
          title="帳戶總值走勢圖"
          dataSource={accountDataSource}
          dataSourceBadges={ACCOUNT_DATA_SOURCE_BADGES}
          statusMsg={accountStatusMsg}
          showSheetInput={showAccountSheetInput}
          onToggleSheetInput={() => { setShowAccountSheetInput(!showAccountSheetInput); setShowAccountInput(false); }}
          sheetUrl={accountSheetUrl}
          onChangeSheetUrl={setAccountSheetUrl}
          onFetchSheet={handleFetchAccountSheets}
          isFetchingSheet={isFetchingAccountSheet}
          sheetHelpExtra={
            <p className="text-xs text-slate-500 font-medium">欄位對應：<strong className="text-slate-700">A 欄＝日期、C 欄＝帳戶總值</strong>（B 欄不會被讀取）。</p>
          }
          showInput={showAccountInput}
          onToggleInput={() => { setShowAccountInput(!showAccountInput); setShowAccountSheetInput(false); }}
          textareaLabel="Data Editor (請輸入：日期 帳戶總值)"
          textareaValue={accountText}
          onChangeTextarea={(val) => { setAccountText(val); setAccountDataSource("Manual"); }}
          textareaPlaceholder={"例如：\n1/5 125340\n1/6 126890\n1/7 $124,200"}
          parseWarning={accountParseWarning}
          accent="teal"
          onClearBackup={handleClearAccountBackup}
          clearBackupTitle="清空本機備份的帳戶總值資料（不影響 Google Sheets）"
        />

        <AccountValueChart
          filteredAccountData={filteredAccountData}
          accountYAxisConfig={accountYAxisConfig}
          accountXAxisInterval={accountXAxisInterval}
          accountShowDots={accountShowDots}
          accountTimeRange={accountTimeRange}
          setAccountTimeRange={setAccountTimeRange}
          accountParseWarning={accountParseWarning}
        />

      </div>
    </div>
  );
}
