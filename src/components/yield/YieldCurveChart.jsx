// src/components/yield/YieldCurveChart.jsx
//
// 從 YieldAnalysis.jsx 抽出來的「收益曲線 / 期間報酬率」圖表區塊：
// 時間範圍與計算方式切換按鈕、Recharts 圖表本體、自訂資料點標籤、PNG 下載，全部自成一體。
// 圖表需要的所有數值（displayData、yAxisConfig 等）都是父層 useMemo 算好的衍生資料，
// 這裡只負責「畫出來」跟「下載」，不做任何資料運算。

import { useRef } from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Area, ComposedChart } from 'recharts';

const TIME_RANGE_OPTIONS = [
  { label: 'YTD', value: 'YTD' },
  { label: '本月至今', value: 'MTD' },
  { label: '1 週', value: '1W' },
  { label: '1 個月', value: '1M' },
  { label: '3 個月', value: '3M' },
  { label: '6 個月', value: '6M' },
  { label: '1 年', value: '1Y' },
];

const SETTLEMENT_UNIT_LABEL_EN = { week: 'Weekly', month: 'Monthly', quarter: 'Quarterly' };

export default function YieldCurveChart({
  displayData,
  yAxisConfig,
  xAxisInterval,
  hasDistinctLatestDot,
  settlementUnit,
  settlementUnitLabel,
  timeRange,
  setTimeRange,
  returnMode,
  setReturnMode,
  parseWarning,
}) {
  const chartRef = useRef(null);

  const CustomLabel = (props) => {
    const { x, y, value, index } = props;
    const item = displayData[index];
    if (!item || typeof x !== 'number' || typeof y !== 'number') return null;
    // 結算節點（週/月/季，依 settlementUnit）照舊顯示數字；另外不論有沒有落在結算節點，
    // 目前選取範圍內「最後一天」（例如 MTD 的今天）一定要顯示數據，
    // 不然使用者只看得到上一個結算節點的數字，看不到最新一天的實際漲跌。
    const isLastPoint = index === displayData.length - 1;
    const isSettlementNode = item.isLastDay && index !== 0;
    const shouldShowLabel = isSettlementNode || isLastPoint;
    if (!shouldShowLabel) return null;
    // 🚀 結算節點跟「強制顯示的最後一天」用不同顏色區分——
    // 之前兩種都畫成同一個深色點，沒辦法從顏色看出這個點是週期結算，還是單純因為
    // 「一定要顯示最新資料」才特別標出來的（尤其兩者剛好是同一天時更容易搞混）。
    const dotColor = isSettlementNode ? "#1e293b" : "#f59e0b";
    return (
      <g key={`label-${index}`}>
        <circle cx={x} cy={y} r={4.5} fill={dotColor} stroke="#fff" strokeWidth={2} />
        <text x={x} y={y - 12} fill="#1e293b" fontSize="11" fontWeight="900" textAnchor="middle" stroke="white" strokeWidth="3" paintOrder="stroke">
          {value}%
        </text>
      </g>
    );
  };

  const handleDownloadImage = () => {
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const img = new Image();

    const container = chartRef.current;
    const clientWidth = container.clientWidth;
    const clientHeight = container.clientHeight;

    const titleSpace = 40;

    canvas.width = clientWidth * 2;
    canvas.height = (clientHeight + titleSpace) * 2;

    img.onload = () => {
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const chartTitle = returnMode === 'period' ? 'Portfolio Period Return' : 'Portfolio Yield Curve';

      ctx.textBaseline = "middle";
      ctx.font = "bold 44px sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(chartTitle, 40, 50);

      const titleWidth = ctx.measureText(chartTitle).width;
      const badgeX = 40 + titleWidth + 24;
      const badgeY = 50;

      ctx.font = "bold 22px sans-serif";
      const rangeText = returnMode === 'period' ? `${timeRange} · Period` : timeRange;

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

      ctx.font = "bold 24px sans-serif";
      const legendY = 50;
      // 🚀 下載圖片的文字全部改英文——App 介面本身是中文沒問題，
      // 但下載出去的圖片常常會分享給別人看，中英夾雜看起來不夠專業，
      // 所以這裡用專門的英文對照表，跟畫面上給自己看的中文 legend（settlementUnitLabel）分開。
      const settlementUnitLabelEN = SETTLEMENT_UNIT_LABEL_EN[settlementUnit] || '';
      const settlementText = `Settlement (${settlementUnitLabelEN})`;
      const latestText = "Latest";
      const settlementTextWidth = ctx.measureText(settlementText).width;
      const latestTextWidth = ctx.measureText(latestText).width;

      const dotR = 10;
      const gapAfterDot = 14;
      const gapBetweenItems = 40;
      // 🚀 只有在圖上真的有畫出琥珀色最新點時，才把它的寬度算進圖例總寬、才畫這個項目——
      // 如果最後一天剛好也是結算節點，圖上只會有深色的結算節點，沒有琥珀色的點，
      // 這種情況下圖例也不該出現「Latest」，不然圖例會對應不到畫面上任何顏色，反而讓人誤解。
      const totalLegendWidth = hasDistinctLatestDot
        ? dotR * 2 + gapAfterDot + settlementTextWidth + gapBetweenItems + dotR * 2 + gapAfterDot + latestTextWidth
        : dotR * 2 + gapAfterDot + settlementTextWidth;

      let legendX = canvas.width - 40 - totalLegendWidth + dotR;

      // 結算節點圖例（深色）
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(legendX, legendY, dotR, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.fillText(settlementText, legendX + dotR + gapAfterDot, legendY);

      // 🚀 最新資料點圖例（琥珀色）——只有圖上真的有琥珀色的點時才畫，
      // 避免最後一天剛好是結算節點、圖上根本沒有琥珀色點時，圖例卻還多畫一個對不到顏色的項目。
      if (hasDistinctLatestDot) {
        const latestX = legendX + dotR + gapAfterDot + settlementTextWidth + gapBetweenItems;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(latestX, legendY, dotR, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#64748b";
        ctx.fillText(latestText, latestX + dotR + gapAfterDot, legendY);
      }

      ctx.textBaseline = "alphabetic";
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, titleSpace);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `portfolio_yield_chart_${timeRange}_${returnMode}.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-xl border border-slate-100 p-5 sm:p-8 relative flex flex-col">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-black text-slate-800 tracking-wide">
            {returnMode === 'period' ? 'Portfolio Period Return' : 'Portfolio Yield Curve'}
          </h3>
          <button onClick={handleDownloadImage} className="px-4 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all whitespace-nowrap">
            🖼️ 下載 PNG
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 mr-1 hidden sm:inline">時間範圍：</span>
          {TIME_RANGE_OPTIONS.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setTimeRange(btn.value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === btn.value
                  ? 'bg-yellow-400 text-slate-900 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 -mt-2">
        <span className="text-xs font-bold text-slate-400 mr-1 hidden sm:inline">計算方式：</span>
        <button
          onClick={() => setReturnMode('cumulative')}
          title="相對固定起點（例如今年 1/1）的累積報酬率，不論選什麼時間範圍，數字基準都不變"
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            returnMode === 'cumulative'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          累積報酬率
        </button>
        <button
          onClick={() => setReturnMode('period')}
          title="把目前選取的時間範圍起點重新當作 0% 基準，只看這段期間單獨的漲跌"
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            returnMode === 'period'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          期間報酬率
        </button>
      </div>

      <div className="w-full h-[500px] mt-2 relative" ref={chartRef}>
        {displayData.length > 0 && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-800" />
              <span className="text-xs font-bold text-slate-500">結算節點：{settlementUnitLabel}</span>
            </span>
            {hasDistinctLatestDot && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-slate-500">最新</span>
              </span>
            )}
          </div>
        )}
        {displayData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-center px-8">
            <p className="text-slate-400 font-bold">
              {parseWarning || "目前沒有可顯示的資料，請確認資料內容或切換時間範圍。"}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} margin={{ top: 40, right: 40, left: 10, bottom: 20 }}>
              <defs><linearGradient id="lG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} dy={15} interval={xAxisInterval} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} unit="%" domain={yAxisConfig.domain} ticks={yAxisConfig.ticks} />
              <Tooltip cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
              <Area type="linear" dataKey="percentage" baseValue={yAxisConfig.domain[0]} fill="url(#lG)" stroke="none" tooltipType="none" animationDuration={1000} />
              <Line type="linear" dataKey="percentage" stroke="#4f46e5" strokeWidth={4} dot={false} activeDot={{ r: 8, fill: '#4f46e5', stroke: '#fff', strokeWidth: 3 }} animationDuration={1000}>
                <LabelList dataKey="percentage" content={<CustomLabel />} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
