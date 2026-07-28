// src/components/portfolio/PortfolioTable.jsx
//
// 從 FrontendOcrTest.jsx 抽出來的可編輯持股表格。純展示型元件：
// 資料跟編輯行為都由父層透過 props 傳入，這個元件本身不持有任何狀態。

export default function PortfolioTable({ tableData, onUpdateRow, onRemoveRow }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider">
            <th className="py-3.5 px-4 font-black">股票代號 Ticker</th>
            <th className="py-3.5 px-4 font-black">持股數量 Shares</th>
            <th className="py-3.5 px-4 font-black text-center w-20">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tableData.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors group">
              <td className="p-2 px-4">
                <input
                  type="text"
                  value={row.ticker}
                  onChange={(e) => onUpdateRow(idx, 'ticker', e.target.value.toUpperCase())}
                  className={`w-full px-2 py-1.5 text-sm font-bold text-indigo-700 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-400 rounded outline-none uppercase transition-all ${
                    row.tickerLowConfidence ? 'ring-2 ring-amber-400 bg-amber-50' : ''
                  }`}
                  placeholder="如: AAPL"
                  title={row.tickerLowConfidence ? '⚠️ OCR 辨識信心值較低，請人工核對此代號' : undefined}
                />
              </td>
              <td className="p-2 px-4">
                <input
                  type="number"
                  value={row.shares}
                  onChange={(e) => onUpdateRow(idx, 'shares', e.target.value)}
                  className={`w-full px-2 py-1.5 text-sm font-mono font-bold text-slate-700 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-indigo-400 rounded outline-none transition-all ${
                    row.sharesLowConfidence ? 'ring-2 ring-amber-400 bg-amber-50' : ''
                  }`}
                  placeholder="數量"
                  title={row.sharesLowConfidence ? '⚠️ OCR 辨識信心值較低，數字可能有誤（例如 6/4、8/0 等易混淆數字），請人工核對' : undefined}
                />
              </td>
              <td className="p-2 text-center">
                <button
                  onClick={() => onRemoveRow(idx)}
                  className="text-slate-300 hover:text-red-500 font-bold px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="移除此行"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tableData.length === 0 && (
        <div className="text-center py-14 px-4">
          <p className="text-sm font-bold text-slate-500 mb-1">目前沒有任何持股資料</p>
          <p className="text-xs text-slate-400">
            點擊上方「📸 智慧載入」上傳截圖（支援 Ctrl+V 貼上），或「＋ 手動新增」直接輸入。
          </p>
        </div>
      )}
    </div>
  );
}
