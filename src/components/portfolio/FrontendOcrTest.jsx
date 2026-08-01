import { useState, useRef, useMemo, useEffect } from 'react';
import { fetchGoogleSheetsCsv, parseGoogleSheetsUrl } from '../../utils/googleSheets';
import { parseOcrDataToPortfolioRows } from '../../utils/ocr/ocrParsing';
import { fetchStockPrices } from '../../utils/fetchStockPrices';
import { useLocalStorageBackedState } from '../../hooks/useLocalStorageBackedState';
import { useOcrWorker } from '../../hooks/useOcrWorker';
import PortfolioTable from './PortfolioTable';
import AnalysisResultPanel from './AnalysisResultPanel';
import TreemapChart from './TreemapChart';
import BackfillMarketValue from './BackfillMarketValue';
import SheetsSettingsPanel from './SheetsSettingsPanel';

// 💡 可在此處直接寫死專屬的 Google Sheets 網址，系統會以此為絕對優先預設值
const DEFAULT_PORTFOLIO_SHEET_URL = "";

const PORTFOLIO_STORAGE_KEY = 'portfolioTableData';

export default function FrontendOcrTest() {
  // 🚀 本機自動儲存：tableData 現在以瀏覽器 localStorage 為預設值來源，
  // 不需要每次重新整理都重新從 Google Sheets 下載。
  const [tableData, setTableData, isLoaded] = useLocalStorageBackedState(
    PORTFOLIO_STORAGE_KEY,
    [],
    {
      validate: (parsed) => Array.isArray(parsed) && parsed.length > 0,
      onRestore: (parsed) => setProgressText(`✅ 已從本機恢復 ${parsed.length} 筆先前的持股資料。`),
    }
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPct, setProgressPct] = useState(0);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rawPayload, setRawPayload] = useState([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('read'); // 'read'（讀取 Google Sheets）| 'write'（寫回 Google Sheets）
  const [sheetUrl, setSheetUrl] = useState("");
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  const [appsScriptUrl, setAppsScriptUrl] = useState("");
  const [appsScriptToken, setAppsScriptToken] = useState("");
  const [writeMode, setWriteMode] = useState('overwrite'); // 'overwrite'：覆蓋更新 | 'append'：新增一列，保留歷史
  const [isUploadingToSheet, setIsUploadingToSheet] = useState(false);

  const fileInputRef = useRef(null);
  const { recognizeImage } = useOcrWorker();

  // 還原上次填過的 Google Sheets 網址（方便使用者手動按「讀取」時不用重打），
  // 但不會於掛載時自動觸發下載——這跟 tableData 是分開處理的（sheetUrl 本身不需要「防止初始值蓋掉」的保護）。
  useEffect(() => {
    const savedUrl = localStorage.getItem('savedPortfolioSheetUrl') || DEFAULT_PORTFOLIO_SHEET_URL;
    if (savedUrl && savedUrl.trim() !== "") {
      setSheetUrl(savedUrl);
    }
    const savedAppsScriptUrl = localStorage.getItem('savedAppsScriptUrl');
    if (savedAppsScriptUrl) setAppsScriptUrl(savedAppsScriptUrl);
    const savedAppsScriptToken = localStorage.getItem('savedAppsScriptToken');
    if (savedAppsScriptToken) setAppsScriptToken(savedAppsScriptToken);
  }, []);

  // 🚀 完全復刻美股收益分析系統的標準 CSV 讀取架構，並動態支援分頁 gid
  const handleFetchGoogleSheets = async (targetUrl = sheetUrl, isAuto = false) => {
    if (!targetUrl.trim()) return;
    if (!isAuto) setIsFetchingSheet(true);
    setProgressText(isAuto ? "⏳ 正在自動同步預設 Google Sheets 持股數據..." : "⏳ 正在連線至 Google Sheets...");

    try {
      const csvText = await fetchGoogleSheetsCsv(targetUrl);

      const parsedRows = [];
      const lines = csvText.split(/\r?\n/);

      for (let line of lines) {
        if (!line.trim()) continue;

        const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/['"]/g, '').trim());

        if (cols.length >= 2) {
          const ticker = cols[0].toUpperCase();
          const sharesStr = cols[1];
          const shares = parseFloat(sharesStr);

          if (ticker && !isNaN(shares) &&
              ticker !== 'TICKER' && ticker !== 'SYMBOL' &&
              ticker !== '股票代號' && ticker !== '代號') {
            parsedRows.push({ ticker, shares });
          }
        }
      }

      if (parsedRows.length === 0) {
        setProgressText("⚠️ 連線成功，但未解析到有效數據。請確保該分頁第一欄為代號，第二欄為股數。");
      } else {
        setHasAnalyzed(false);
        setTableData(parsedRows);
        setProgressText(`✅ 成功從雲端同步 ${parsedRows.length} 筆持股數據！`);
        setProgressPct(0);

        localStorage.setItem('savedPortfolioSheetUrl', targetUrl);
        setSheetUrl(targetUrl);
        setShowSettings(false);
      }
    } catch (error) {
      console.error(error);
      if (error.message === 'INVALID_URL') {
        setProgressText("❌ 無效的 Google Sheets 連結，請確認網址格式是否完整。");
      } else {
        setProgressText("❌ 讀取失敗！請確認試算表共用權限已設定為「知道連結的使用者皆可檢視」。");
      }
    } finally {
      if (!isAuto) setIsFetchingSheet(false);
    }
  };

  // 🚀 透過 Google Apps Script Web App 把目前表格資料寫回 Google Sheets
  // 不需要 Google Cloud OAuth 憑證，全程在使用者自己的 Google 帳號底下運作
  const handleUploadToGoogleSheets = async () => {
    if (!appsScriptUrl.trim()) {
      setShowSettings(true);
      setSettingsTab('write');
      setProgressText("⚠️ 請先設定 Google Apps Script Web App 網址。");
      return;
    }
    if (tableData.length === 0) {
      setProgressText("⚠️ 目前沒有資料可以上傳，請先辨識或手動輸入持股。");
      return;
    }

    setIsUploadingToSheet(true);
    setProgressText("⏳ 正在寫入 Google Sheets...");

    try {
      const parsedSheet = parseGoogleSheetsUrl(sheetUrl);
      const rows = tableData
        .filter(row => row.ticker && row.ticker.trim() !== "" && row.shares !== "" && !isNaN(parseFloat(row.shares)))
        .map(row => ({ ticker: row.ticker.trim().toUpperCase(), shares: parseFloat(row.shares) }));

      if (rows.length === 0) {
        setProgressText("⚠️ 表格中沒有有效的資料列（代號與股數都需要填寫）。");
        setIsUploadingToSheet(false);
        return;
      }

      const payload = {
        token: appsScriptToken,
        mode: writeMode,
        gid: parsedSheet ? parsedSheet.gid : null,
        rows
      };

      // 🚀 刻意不手動設定 Content-Type，讓瀏覽器預設帶 text/plain，
      // 這樣才會被視為 CORS 的「simple request」而不會觸發 OPTIONS 預檢，
      // 因為 Google Apps Script 網頁應用程式無法正確處理預檢請求
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        setProgressText(
          writeMode === 'append'
            ? `✅ 已成功新增 ${result.written} 筆資料到 Google Sheets！`
            : `✅ 已成功覆蓋更新 Google Sheets，共 ${result.written} 筆資料！`
        );
        localStorage.setItem('savedAppsScriptUrl', appsScriptUrl);
        localStorage.setItem('savedAppsScriptToken', appsScriptToken);
        setShowSettings(false);
      } else {
        setProgressText(`❌ 寫入失敗：${result.error || '未知錯誤，請檢查 Apps Script 部署設定。'}`);
      }
    } catch (error) {
      console.error(error);
      setProgressText("❌ 寫入失敗，請確認 Apps Script 網址正確，且部署權限已設為「任何人」可存取。");
    } finally {
      setIsUploadingToSheet(false);
    }
  };

  // 🚀 選好圖片後自動辨識，不需要額外按「執行辨識」
  const runFrontendOCR = async (imageSrc) => {
    setIsProcessing(true);
    setTableData([]);
    setRawPayload([]);
    setHasAnalyzed(false);
    setProgressPct(0);

    try {
      const ocrData = await recognizeImage(imageSrc, {
        onStageChange: (stage) => {
          if (stage === 'preprocessing') setProgressText("🔄 正在進行影像強化前處理 (放大 + 自動二值化)...");
          if (stage === 'loadingEngine') setProgressText("⚙️ 正在載入 OCR 引擎並辨識文字...");
          if (stage === 'downloadingEngine') setProgressText("📥 首次使用，正在下載 OCR 引擎 (約需幾秒)...");
          if (stage === 'recognizing') setProgressText("🧠 正在進行高速字元解碼...");
        },
        onProgress: (progress) => setProgressPct(Math.round(progress * 100)),
      });

      const { rows: dedupedRows, lowConfidenceCount } = parseOcrDataToPortfolioRows(ocrData);

      setTableData(dedupedRows);
      setProgressText(
        dedupedRows.length > 0
          ? (lowConfidenceCount > 0
              ? `✅ 辨識完成，共找到 ${dedupedRows.length} 筆資料。⚠️ 其中 ${lowConfidenceCount} 筆信心值較低（黃色標示），請務必核對後再使用。`
              : `✅ 辨識完成，共找到 ${dedupedRows.length} 筆資料，請核對並修正表格內容。`)
          : "⚠️ 未辨識到有效資料，請改用更清晰的截圖，或直接手動輸入。"
      );
    } catch (error) {
      console.error(error);
      setProgressText("❌ 辨識失敗，請檢查主控台，或改用手動輸入。");
    } finally {
      setIsProcessing(false);
      setProgressPct(0);
    }
  };

  const processImageFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const imageUrl = URL.createObjectURL(file);
      runFrontendOCR(imageUrl);
    }
  };

  const handleImageUpload = (e) => {
    processImageFile(e.target.files[0]);
    if (e.target.value) e.target.value = '';
  };

  const handleSmartLoad = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      let imageFound = false;

      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "clipboard-image.png", { type: imageType });
          processImageFile(file);
          imageFound = true;
          break;
        }
      }

      if (!imageFound) fileInputRef.current.click();
    } catch (err) {
      fileInputRef.current.click();
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          processImageFile(file);
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const handleUpdateRow = (index, field, value) => {
    const newData = [...tableData];
    newData[index][field] = value;
    // 使用者已手動核對/修正過這欄，移除低信心值警示
    if (field === 'ticker') newData[index].tickerLowConfidence = false;
    if (field === 'shares') newData[index].sharesLowConfidence = false;
    setTableData(newData);
  };

  // 🚀 把目前表格複製成 Tab 分隔文字，可以直接貼到 Google Sheets 的儲存格裡，
  // 貼上後代號、股數會自動對齊兩欄。
  const handleCopyTable = async () => {
    const validRows = tableData.filter(row => row.ticker.trim() !== '' || String(row.shares).trim() !== '');
    if (validRows.length === 0) {
      setProgressText("⚠️ 目前沒有資料可以複製。");
      return;
    }
    const tsv = validRows.map(row => `${row.ticker}\t${row.shares}`).join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      setProgressText(`✅ 已複製 ${validRows.length} 筆資料，可直接貼到 Google Sheets。`);
    } catch (error) {
      console.error(error);
      setProgressText("❌ 複製失敗，請確認瀏覽器已授權剪貼簿權限。");
    }
  };

  // 🚀 讓使用者可以主動清掉本機自動儲存的持股資料（例如要重新開始一份全新的清單）
  const handleClearLocalData = () => {
    if (tableData.length > 0 && !window.confirm('確定要清空目前表格內容嗎？此動作會一併清除本機自動儲存的資料，無法復原。')) return;
    setTableData([]);
    setRawPayload([]);
    setHasAnalyzed(false);
    try {
      localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
    } catch (error) {
      console.error(error);
    }
    setProgressText('🗑️ 已清空表格與本機儲存的資料。');
  };

  const handleAddRow = () => {
    setTableData([...tableData, { ticker: '', shares: '' }]);
  };

  const handleRemoveRow = (index) => {
    const newData = tableData.filter((_, i) => i !== index);
    setTableData(newData);
  };

  const runFrontendQuantitativeAnalysis = async () => {
    const validData = tableData.filter(row => row.ticker.trim() !== '' && !isNaN(parseFloat(row.shares)));

    if (validData.length === 0) {
      alert("請確保表格中最少有一筆完整且合法的持股資料！");
      return;
    }

    setIsAnalyzing(true);
    setHasAnalyzed(false);
    setProgressPct(0);

    try {
      // 🚀 [P0] 併發限制 + 逾時保護，見 utils/priceFetch.js 與 utils/fetchStockPrices.js
      const { payload: payloadData, failedTickers } = await fetchStockPrices(validData, ({ completed, total }) => {
        setProgressPct(Math.round((completed / total) * 100));
        setProgressText(`🔄 正在連線至 Yahoo Finance 抓取最新交易日官方收盤價... (${completed}/${total})`);
      });

      setRawPayload(payloadData);
      setHasAnalyzed(true);
      setProgressText(
        failedTickers.length > 0
          ? `⚠️ 量化分析完成，但有 ${failedTickers.length} 檔報價抓取失敗（暫以 $0 計算，佔比會失真，請人工核對）：${failedTickers.join('、')}`
          : "✅ 量化分析執行成功！"
      );
    } catch (error) {
      console.error(error);
      setProgressText("❌ 量化運算失敗，請檢查 API 狀態。");
    } finally {
      setIsAnalyzing(false);
      setProgressPct(0);
    }
  };

  const analysisResult = useMemo(() => {
    if (rawPayload.length === 0) return null;

    const totalMarketValue = rawPayload.reduce((sum, item) => sum + (item.Shares * item.Price), 0);

    const processedRows = rawPayload.map(item => {
      const mv = item.Shares * item.Price;
      const ratio = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0;
      return {
        Ticker: item.Ticker,
        Shares: item.Shares,
        Price: item.Price,
        Market_Value: mv,
        Ratio: ratio
      };
    }).sort((a, b) => b.Ratio - a.Ratio);

    const maxRatio = processedRows.length > 0 ? Math.max(...processedRows.map(r => r.Ratio)) : 100;
    const xAxisMax = maxRatio > 0 ? maxRatio * 1.15 : 100;

    return {
      total_market_value: totalMarketValue,
      rows: processedRows,
      xAxisMax: xAxisMax
    };
  }, [rawPayload]);

  return (
    <div className="font-sans text-slate-900 w-full mt-4">
      <div className="max-w-4xl mx-auto bg-white p-5 sm:p-8 rounded-3xl sm:rounded-[2.5rem] shadow-xl border border-slate-100">

        <header className="mb-8 border-b pb-6 border-slate-100">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            📊 投資組合量化分析
          </h2>
          <p className="text-slate-500 font-medium mt-2">
            截圖辨識、手動輸入或從 Google Sheets 匯入您的美股持股，系統將自動抓取即時報價並生成精準排行圖表。表格內容會自動儲存在本機瀏覽器，重新整理不會遺失。
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={handleSmartLoad}
              disabled={isProcessing}
              className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? '⏳ 辨識中...' : '📸 智慧載入 (截圖/檔案)'}
            </button>
            <button
              onClick={handleUploadToGoogleSheets}
              disabled={tableData.length === 0 || isUploadingToSheet}
              className={`px-5 py-2.5 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 ${
                tableData.length === 0 || isUploadingToSheet
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isUploadingToSheet ? '⏳ 上傳中...' : '☁️ 上傳至 Google Sheets'}
            </button>
            <button
              onClick={handleAddRow}
              className="px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
            >
              ＋ 手動新增
            </button>
            <button
              onClick={handleCopyTable}
              disabled={tableData.length === 0}
              className={`px-5 py-2.5 border text-sm font-bold rounded-xl shadow-sm transition-all ${
                tableData.length === 0
                  ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="複製表格內容，可直接貼到 Google Sheets"
            >
              📄 複製表格
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Google Sheets 相關設定"
              aria-label="Google Sheets 相關設定"
              className={`p-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center ${
                showSettings ? 'bg-blue-50 border-blue-200 text-blue-600 border' : 'border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              ⚙️
            </button>
            <button
              onClick={handleClearLocalData}
              disabled={tableData.length === 0}
              title="清空表格並清除本機自動儲存的資料"
              aria-label="清空表格並清除本機自動儲存的資料"
              className={`p-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center border ${
                tableData.length === 0
                  ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
              }`}
            >
              🗑️
            </button>
            <button
              onClick={runFrontendQuantitativeAnalysis}
              disabled={tableData.length === 0 || isProcessing || isAnalyzing}
              className={`ml-auto px-5 py-2.5 text-sm font-bold rounded-xl shadow-md transition-all ${
                tableData.length === 0 || isProcessing || isAnalyzing
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isAnalyzing ? '⏳ 即時同步報價中...' : '🚀 開始量化分析'}
            </button>
          </div>

          {showSettings && (
            <SheetsSettingsPanel
              settingsTab={settingsTab}
              onChangeSettingsTab={setSettingsTab}
              sheetUrl={sheetUrl}
              onChangeSheetUrl={setSheetUrl}
              onFetchSheet={handleFetchGoogleSheets}
              isFetchingSheet={isFetchingSheet}
              appsScriptUrl={appsScriptUrl}
              onChangeAppsScriptUrl={setAppsScriptUrl}
              appsScriptToken={appsScriptToken}
              onChangeAppsScriptToken={setAppsScriptToken}
              writeMode={writeMode}
              onChangeWriteMode={setWriteMode}
              onUploadToSheet={handleUploadToGoogleSheets}
              isUploadingToSheet={isUploadingToSheet}
              hasTableData={tableData.length > 0}
            />
          )}

          {progressText && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-slate-600">{progressText}</span>
                {progressPct > 0 && <span className="text-sm font-bold text-indigo-600">{progressPct}%</span>}
              </div>
              {progressPct > 0 && (
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
                </div>
              )}
            </div>
          )}

          <PortfolioTable
            tableData={tableData}
            onUpdateRow={handleUpdateRow}
            onRemoveRow={handleRemoveRow}
          />

          <div className="mt-4">
            <BackfillMarketValue holdings={tableData} />
          </div>
        </div>

        {hasAnalyzed && analysisResult && (
          <div className="mt-8 space-y-8 border-t border-slate-100 pt-8 animate-in fade-in duration-500">
            <AnalysisResultPanel analysisResult={analysisResult} />
            <TreemapChart rows={analysisResult.rows} />
          </div>
        )}

      </div>
    </div>
  );
}
