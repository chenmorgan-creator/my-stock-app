// src/components/yield/SheetBackedDataHeader.jsx
//
// 從 YieldAnalysis.jsx 抽出來的共用 UI：YieldAnalysis 裡「收益曲線」跟「帳戶總值」
// 兩個區塊，原本各自寫了一份幾乎一模一樣的「標題 + 資料來源徽章 + 狀態訊息 +
// 設定/下載/編輯/清除按鈕 + Google Sheets 設定面板 + 手動編輯文字框」，
// 抽成一份共用元件後，兩邊只需要傳入不同的文字內容跟 accent 顏色。

const ACCENT_CLASSES = {
  indigo: {
    panelBorder: 'border-indigo-100',
    label: 'text-indigo-600',
    textareaFocus: 'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200',
  },
  teal: {
    panelBorder: 'border-teal-100',
    label: 'text-teal-600',
    textareaFocus: 'focus:border-teal-500 focus:ring-2 focus:ring-teal-200',
  },
};

export default function SheetBackedDataHeader({
  title,
  dataSource,
  dataSourceBadges,
  statusMsg,

  showSheetInput,
  onToggleSheetInput,
  sheetUrl,
  onChangeSheetUrl,
  onFetchSheet,
  isFetchingSheet,
  sheetHelpExtra,

  showInput,
  onToggleInput,
  textareaLabel,
  textareaValue,
  onChangeTextarea,
  textareaPlaceholder,
  parseWarning,
  accent = 'indigo',

  onClearBackup,
  clearBackupTitle,
}) {
  const accentClasses = ACCENT_CLASSES[accent];

  return (
    <>
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            📄 資料來源：
            {Object.entries(dataSourceBadges).map(([key, badge]) => (
              dataSource === key && (
                <span key={key} className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.className}`}>
                  {badge.label}
                </span>
              )
            ))}
          </p>
          {statusMsg && <p className="text-sm font-bold text-emerald-600 mt-2">{statusMsg}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onToggleSheetInput}
            className={`px-5 py-2 border rounded-xl text-sm font-bold shadow-sm transition-all ${
              showSheetInput ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            ⚙️ 設定 Google Sheets
          </button>
          <button
            onClick={onToggleInput}
            className={`px-5 py-2 rounded-xl text-sm font-bold shadow-lg transition-all ${
              showInput ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
            }`}
          >
            {showInput ? "✓ 完成編輯" : "✎ 手動編輯數據"}
          </button>
          <button
            onClick={onClearBackup}
            title={clearBackupTitle}
            aria-label={clearBackupTitle}
            className="p-2 border border-slate-200 rounded-xl text-slate-500 shadow-sm hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
          >
            🗑️
          </button>
        </div>
      </header>

      {showSheetInput && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col gap-3">
            <label className="text-slate-900 font-bold text-sm tracking-wide">🔗 綁定專屬 Google Sheets 共用連結</label>
            <p className="text-xs text-slate-500 font-medium">前置作業：請確認試算表共用權限已設為<strong className="text-slate-700">「知道連結的使用者皆可檢視」</strong>。設定後，系統將永遠以該檔案作為預設來源。若要指定特定分頁，請切換到該分頁後複製網址（系統會自動識別末尾 <code>gid=...</code> 參數）。</p>
            {sheetHelpExtra}
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=123456789"
                className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                value={sheetUrl}
                onChange={(e) => onChangeSheetUrl(e.target.value)}
              />
              <button
                onClick={() => onFetchSheet(sheetUrl, false)}
                disabled={isFetchingSheet || !sheetUrl.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all whitespace-nowrap"
              >
                {isFetchingSheet ? "綁定中..." : "確認載入並設為預設"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInput && (
        <div className={`bg-white p-6 rounded-3xl shadow-xl border animate-in fade-in slide-in-from-top-4 duration-300 ${accentClasses.panelBorder}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <span className={`font-bold text-sm uppercase tracking-wider ${accentClasses.label}`}>{textareaLabel}</span>
          </div>
          <textarea
            className={`w-full h-40 p-5 text-sm font-mono text-slate-900 bg-white border-2 border-slate-300 rounded-2xl transition-all outline-none resize-none mb-4 shadow-inner ${accentClasses.textareaFocus}`}
            value={textareaValue}
            placeholder={textareaPlaceholder}
            onChange={(e) => onChangeTextarea(e.target.value)}
          />
          {parseWarning && (
            <p className="text-sm font-bold text-rose-600 -mt-2 mb-2">{parseWarning}</p>
          )}
        </div>
      )}
    </>
  );
}
