// src/components/yield/AccountValueChart.jsx
//
// 從 YieldAnalysis.jsx 抽出來的「帳戶總值走勢圖」區塊：時間範圍切換、
// Recharts 圖表本體、PNG 下載，全部自成一體。跟 YieldCurveChart 邏輯結構相同，
// 差別只在這裡沒有「計算方式（累積/期間）」切換，也不需要 CustomLabel。

import { useRef } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart } from 'recharts';
import { formatCurrencyCompact, formatCurrencyFull } from '../../utils/chartAxis';

const TIME_RANGE_OPTIONS = [
  { label: 'YTD', value: 'YTD' },
  { label: '本月至今', value: 'MTD' },
  { label: '1 週', value: '1W' },
  { label: '1 個月', value: '1M' },
  { label: '3 個月', value: '3M' },
  { label: '6 個月', value: '6M' },
  { label: '1 年', value: '1Y' },
];

export default function AccountValueChart({
  filteredAccountData,
  accountYAxisConfig,
  accountXAxisInterval,
  accountShowDots,
  accountTimeRange,
  setAccountTimeRange,
  accountParseWarning,
}) {
  const accountChartRef = useRef(null);

  const handleDownloadAccountImage = () => {
    const svg = accountChartRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const img = new Image();

    const container = accountChartRef.current;
    const clientWidth = container.clientWidth;
    const clientHeight = container.clientHeight;

    const titleSpace = 40;

    canvas.width = clientWidth * 2;
    canvas.height = (clientHeight + titleSpace) * 2;

    img.onload = () => {
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textBaseline = "middle";
      ctx.font = "bold 44px sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText("Account Value Trend", 40, 50);

      const titleWidth = ctx.measureText("Account Value Trend").width;
      const badgeX = 40 + titleWidth + 24;
      const badgeY = 50;

      ctx.font = "bold 22px sans-serif";
      const rangeText = accountTimeRange;

      const textWidth = ctx.measureText(rangeText).width;
      const paddingH = 20;
      const paddingV = 10;
      const bW = textWidth + paddingH * 2;
      const bH = 22 + paddingV * 2;

      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY - bH / 2, bW, bH, 8);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.textAlign = "center";
      ctx.fillText(rangeText, badgeX + bW / 2, badgeY);
      ctx.textAlign = "left";

      ctx.textBaseline = "alphabetic";
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, titleSpace);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `account_value_chart_${accountTimeRange}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 p-5 sm:p-8 relative flex flex-col">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-black text-slate-800 tracking-wide">
            Account Value Trend
          </h3>
          <button onClick={handleDownloadAccountImage} className="px-4 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all whitespace-nowrap">
            🖼️ 下載 PNG
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 mr-1 hidden sm:inline">時間範圍：</span>
          {TIME_RANGE_OPTIONS.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setAccountTimeRange(btn.value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                accountTimeRange === btn.value
                  ? 'bg-yellow-400 text-slate-900 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full h-[500px] mt-2" ref={accountChartRef}>
        {filteredAccountData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-center px-8">
            <p className="text-slate-400 font-bold">
              {accountParseWarning || "目前沒有帳戶總值資料，請按「✎ 手動編輯數據」輸入，或設定 Google Sheets 同步。"}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredAccountData} margin={{ top: 40, right: 40, left: 10, bottom: 20 }}>
              <defs><linearGradient id="lGAccount" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.15}/><stop offset="95%" stopColor="#0f766e" stopOpacity={0.01}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} dy={15} interval={accountXAxisInterval} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                domain={accountYAxisConfig.domain}
                ticks={accountYAxisConfig.ticks}
                tickFormatter={formatCurrencyCompact}
              />
              <Tooltip
                cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                formatter={(value) => [formatCurrencyFull(value), 'Account Value']}
              />
              <Area type="linear" dataKey="value" baseValue={accountYAxisConfig.domain[0]} fill="url(#lGAccount)" stroke="none" tooltipType="none" animationDuration={1000} />
              <Line
                type="linear"
                dataKey="value"
                stroke="#0f766e"
                strokeWidth={3}
                dot={accountShowDots ? { r: 3, fill: '#0f766e', stroke: '#fff', strokeWidth: 1.5 } : false}
                activeDot={{ r: 8, fill: '#0f766e', stroke: '#fff', strokeWidth: 3 }}
                animationDuration={1000}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
