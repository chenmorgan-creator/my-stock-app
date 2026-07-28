// src/components/portfolio/AnalysisResultPanel.jsx
//
// 從 FrontendOcrTest.jsx 抽出來的量化分析結果展示：總市值卡片 + 持股資產排行表格。
// 純展示型元件，資料由父層的 analysisResult（useMemo 算出來的衍生資料）傳入。

export default function AnalysisResultPanel({ analysisResult }) {
  return (
    <>
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl text-white shadow-xl flex flex-col justify-center gap-2">
        <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest block">Total Market Value</span>
        <h3 className="text-3xl font-black tracking-tight font-mono">
          ${analysisResult.total_market_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h3>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">持股資產排行清單 (Market Value Ranking)</span>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider">
                <th className="py-3.5 px-4 font-black text-center w-16">排行</th>
                <th className="py-3.5 px-4 font-black">Ticker</th>
                <th className="py-3.5 px-4 font-black text-right">Shares (股數)</th>
                <th className="py-3.5 px-4 font-black text-right">Price (現價)</th>
                <th className="py-3.5 px-4 font-black text-right">Market Value (市值)</th>
                <th className="py-3.5 px-4 font-black text-right">Ratio (持股佔比)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-mono font-bold text-slate-700">
              {analysisResult.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 text-center text-slate-400 font-sans font-bold">{idx + 1}</td>
                  <td className="py-3.5 px-4 text-indigo-600 font-sans">{row.Ticker}</td>
                  <td className="py-3.5 px-4 text-right text-slate-600">{row.Shares.toLocaleString()}</td>
                  <td className="py-3.5 px-4 text-right text-emerald-600">${row.Price.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right text-slate-900">${row.Market_Value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className="py-3.5 px-4 text-right text-indigo-500">{row.Ratio.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
