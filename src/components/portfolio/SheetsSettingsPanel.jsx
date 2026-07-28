// src/components/portfolio/SheetsSettingsPanel.jsx
//
// 從 FrontendOcrTest.jsx 抽出來的「讀取／寫回 Google Sheets」設定面板。
// 純展示型元件：兩個分頁（read / write）的輸入框狀態、送出行為都由父層透過 props 控制。

export default function SheetsSettingsPanel({
  settingsTab,
  onChangeSettingsTab,

  // 讀取分頁
  sheetUrl,
  onChangeSheetUrl,
  onFetchSheet,
  isFetchingSheet,

  // 寫回分頁
  appsScriptUrl,
  onChangeAppsScriptUrl,
  appsScriptToken,
  onChangeAppsScriptToken,
  writeMode,
  onChangeWriteMode,
  onUploadToSheet,
  isUploadingToSheet,
  hasTableData,
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => onChangeSettingsTab('read')}
          className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
            settingsTab === 'read' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          🔗 讀取 Google Sheets
        </button>
        <button
          onClick={() => onChangeSettingsTab('write')}
          className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
            settingsTab === 'write' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          📤 寫回 Google Sheets
        </button>
      </div>

      {settingsTab === 'read' && (
        <div className="p-6 flex flex-col gap-3">
          <label className="text-slate-900 font-bold text-sm tracking-wide">🔗 綁定專屬 Google Sheets 投資組合</label>
          <p className="text-xs text-slate-500 font-medium">前置作業：請確認試算表權限為「知道連結的使用者皆可檢視」。若要指定特定分頁，請切換到該分頁後複製網址（系統會自動識別末尾 <code>gid=...</code> 參數）。</p>
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
              {isFetchingSheet ? "綁定同步中..." : "確認載入並設為預設"}
            </button>
          </div>
        </div>
      )}

      {settingsTab === 'write' && (
        <div className="p-6 flex flex-col gap-3">
          <label className="text-slate-900 font-bold text-sm tracking-wide">📤 設定寫回 Google Sheets（Apps Script Web App）</label>
          <p className="text-xs text-slate-500 font-medium">
            請到你的 Google Sheets 依序點選「擴充功能 → Apps Script」，貼上提供的程式碼並部署成「網頁應用程式」（執行身分：我；存取權限：任何人），
            部署完成後把網址貼在下方。Token 需與 Apps Script 程式碼裡設定的 <code>SECRET_TOKEN</code> 完全一致，避免其他人拿到網址就能亂寫資料。
          </p>
          <input
            type="text"
            placeholder="https://script.google.com/macros/s/xxxxxxxx/exec"
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            value={appsScriptUrl}
            onChange={(e) => onChangeAppsScriptUrl(e.target.value)}
          />
          <input
            type="password"
            placeholder="Token（需與 Apps Script 內的 SECRET_TOKEN 一致，可留空但不建議）"
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            value={appsScriptToken}
            onChange={(e) => onChangeAppsScriptToken(e.target.value)}
          />

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mt-1">
            <span className="text-xs font-bold text-slate-500">寫入方式：</span>
            <div className="flex gap-2">
              <button
                onClick={() => onChangeWriteMode('overwrite')}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                  writeMode === 'overwrite'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                覆蓋更新（取代原本持股清單）
              </button>
              <button
                onClick={() => onChangeWriteMode('append')}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${
                  writeMode === 'append'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                新增一列（保留歷史紀錄）
              </button>
            </div>
          </div>

          <button
            onClick={onUploadToSheet}
            disabled={isUploadingToSheet || !appsScriptUrl.trim() || !hasTableData}
            className="mt-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all self-start"
          >
            {isUploadingToSheet ? "上傳中..." : "儲存設定並立即上傳"}
          </button>
        </div>
      )}
    </div>
  );
}
