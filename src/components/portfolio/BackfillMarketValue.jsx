import { useState } from 'react';
import { computeBackfilledMarketValues } from '../../utils/backfillMarketValue';

// 🚀 回填遺漏市值：假設「目前這份持股清單」在指定的期間內沒有變化，
// 用每一天的歷史收盤價 × 股數，反推出那幾天的持股總市值，
// 讓使用者可以貼回 Google Sheets 的 A欄（日期）+ D欄（股票市值），
// F欄（現金）、K欄（融資）需要使用者自己知道當時的實際數字，本來就該手動填，這裡不會替使用者猜。

function todayMinusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function BackfillMarketValue({ holdings }) {
  const [expanded, setExpanded] = useState(false);
  const [startDate, setStartDate] = useState(todayMinusDays(7));
  const [endDate, setEndDate] = useState(todayMinusDays(1));
  const [isComputing, setIsComputing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [results, setResults] = useState(null);
  const [copyLabel, setCopyLabel] = useState('📋 複製全部（可直接貼到 Google Sheets）');

  const validHoldingsCount = holdings.filter(
    h => h.ticker && h.ticker.trim() !== '' && h.shares !== '' && !isNaN(parseFloat(h.shares))
  ).length;

  const handleCompute = async () => {
    if (validHoldingsCount === 0) {
      setStatusMsg('⚠️ 目前沒有有效的持股資料，請先在上方表格輸入股票代號與股數。');
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setStatusMsg('⚠️ 請確認起訖日期正確，開始日期不能晚於結束日期。');
      return;
    }

    setIsComputing(true);
    setStatusMsg('⏳ 正在抓取歷史收盤價，這可能需要幾秒鐘...');
    setResults(null);

    try {
      const { results: computed, failedTickers } = await computeBackfilledMarketValues(
        holdings,
        startDate,
        endDate,
        ({ completed, total }) => setStatusMsg(`⏳ 正在抓取歷史股價... (${completed}/${total} 檔)`)
      );

      if (computed.length === 0) {
        setStatusMsg('⚠️ 這段期間內沒有任何交易日（可能都是假日/週末），請重新選擇日期範圍。');
        setIsComputing(false);
        return;
      }

      setResults(computed);

      const hasMissing = computed.some(r => r.missingTickers.length > 0);
      if (failedTickers.length > 0) {
        setStatusMsg(`⚠️ 計算完成，但 ${failedTickers.join('、')} 抓不到歷史資料，以下結果可能不完整，請人工核對。`);
      } else if (hasMissing) {
        setStatusMsg('⚠️ 計算完成，但部分日期有個別股票缺資料（可能當天剛好還沒上市或代號有誤），該筆金額會偏低，請核對標示的日期。');
      } else {
        setStatusMsg(`✅ 已計算出 ${computed.length} 個交易日的股票市值，可以複製貼到 Google Sheets 了。`);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg('❌ 計算失敗，請檢查網路連線後再試一次。');
    } finally {
      setIsComputing(false);
    }
  };

  const handleCopy = async () => {
    if (!results) return;
    // Tab 分隔：貼到 Google Sheets 時，Tab 會自動被拆成不同欄位，
    // 直接貼在 A 欄該列的儲存格，就會自動填進 A（日期）與下一欄（市值），
    // 使用者只要確保貼上的起始儲存格對到 A 欄、且下一欄就是 D 欄（如果中間還有 B、C 欄，
    // 貼上前建議先選取 D 欄該列再貼，或貼完後再手動搬移一次）。
    const text = results.map(r => `${r.date}\t${r.marketValue.toFixed(2)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('✅ 已複製！');
      setTimeout(() => setCopyLabel('📋 複製全部（可直接貼到 Google Sheets）'), 2000);
    } catch (err) {
      setStatusMsg('❌ 複製失敗，你的瀏覽器可能不支援自動複製，請手動選取表格內容複製。');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-bold text-slate-800">🔄 回填遺漏日期的股票市值</span>
        <span className="text-slate-400 text-sm">{expanded ? '收合 ▲' : '展開 ▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            假設<strong className="text-slate-700">目前上方表格的持股清單</strong>在你選的這段期間內沒有變化，
            系統會用每天的歷史收盤價反推出「股票市值」（對應你 Google Sheets 的 D 欄），
            計算完成後可以複製貼到 A 欄（日期）＋ D 欄（市值），F 欄現金與 K 欄融資請自行手動填入，
            C 欄總值就會由你原本的公式自動算出來。
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">開始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">結束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleCompute}
              disabled={isComputing}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isComputing ? '計算中...' : '開始計算'}
            </button>
          </div>

          {statusMsg && (
            <p className="text-sm text-slate-600">{statusMsg}</p>
          )}

          {results && results.length > 0 && (
            <div className="space-y-3">
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse min-w-[320px]">
                  <thead>
                    <tr className="bg-slate-100 text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 px-3 font-bold">日期</th>
                      <th className="py-2 px-3 font-bold text-right">股票市值（D欄）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-mono">
                    {results.map((r) => (
                      <tr key={r.date} className={r.missingTickers.length > 0 ? 'bg-amber-50' : ''}>
                        <td className="py-2 px-3 text-slate-700">{r.date}</td>
                        <td className="py-2 px-3 text-right text-slate-900">
                          ${r.marketValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          {r.missingTickers.length > 0 && (
                            <span className="ml-2 text-amber-600 text-xs" title={`缺少：${r.missingTickers.join('、')}`}>
                              ⚠️
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-900 transition-colors"
              >
                {copyLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
