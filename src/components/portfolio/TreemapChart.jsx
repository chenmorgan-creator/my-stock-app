// src/components/portfolio/TreemapChart.jsx
//
// 從 FrontendOcrTest.jsx 抽出來的資產配置方塊圖（Treemap）。
// 自成一個元件：資料進來（analysisResult.rows），自己算 treemapData、自己畫格子、
// 自己處理 PNG 下載，父層不需要知道 Treemap 內部怎麼運作。

import { useRef, useMemo } from 'react';
import { Treemap, ResponsiveContainer } from 'recharts';

const PALETTE = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6', '#14B8A6', '#F97316', '#64748B', '#EC4899'];

// 粗略估算文字寬度（假設 bold sans-serif，每個字元約佔 0.58 倍字級寬度），
// 用來判斷某個字級底下，文字放不放得進格子裡。
function estimateTextWidth(text, fontSize) {
  return text.length * fontSize * 0.58;
}

// 🚀 自訂每個方塊的畫法：格子夠大才顯示文字，太小的格子就只留顏色，
// 不會像圓餅圖的指引線那樣跟旁邊的格子擠在一起或重疊。
function TreemapCell(props) {
  const { x, y, width, height, name, ratio, color, depth } = props;
  if (depth !== 1 || width <= 0 || height <= 0) return null;

  const PADDING = 10;
  const innerW = width - PADDING * 2;
  const innerH = height - PADDING * 2;
  const ratioText = `${ratio.toFixed(1)}%`;

  // 依格子大小挑一個字級：格子的短邊決定文字大小上限，避免大格子裡文字比例失衡，
  // 也避免小格子裡文字被硬塞到超出範圍。
  const fontSize = Math.max(10, Math.min(20, Math.min(width, height) / 4.5));
  const ratioFontSize = fontSize * 0.8;
  const lineGap = fontSize * 1.3;

  // 固定「代號在上、比例在下、都靠左上角對齊」的排版，不管格子形狀是瘦高還是扁寬，
  // 文字位置都可預期、整張圖掃視起來比較一致。
  let mode = 'none';
  if (innerH >= lineGap + ratioFontSize && innerW >= estimateTextWidth(name, fontSize)) {
    mode = 'double';
  } else if (innerH >= fontSize && innerW >= estimateTextWidth(name, fontSize)) {
    // 高度不夠放兩行：只顯示代號，比例先省略
    mode = 'nameOnly';
  }
  // 以上都放不下：格子太小，只留顏色色塊，不勉強塞文字造成溢出或重疊。
  // 這種格子仍然可以滑鼠移上去看原生 tooltip（代號＋比例），資訊不會完全不見。

  return (
    <g fontFamily="sans-serif">
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={2} rx={6}>
        <title>{`${name}: ${ratioText}`}</title>
      </rect>

      {mode === 'double' && (
        <>
          <text x={x + PADDING} y={y + PADDING + fontSize * 0.8} fontSize={fontSize} fontWeight="bold" fill="white">
            {name}
          </text>
          <text x={x + PADDING} y={y + PADDING + lineGap + ratioFontSize * 0.7} fontSize={ratioFontSize} fontWeight="600" fill="rgba(255,255,255,0.95)">
            {ratioText}
          </text>
        </>
      )}

      {mode === 'nameOnly' && (
        <text x={x + PADDING} y={y + PADDING + fontSize * 0.8} fontSize={fontSize} fontWeight="bold" fill="white">
          {name}
        </text>
      )}
    </g>
  );
}

export default function TreemapChart({ rows }) {
  const containerRef = useRef(null);

  // 🚀 資產配置方塊圖（Treemap）：每檔股票依市值佔比分配一塊獨立的矩形面積，
  // 跟圓餅圖不同，方塊圖不會有「文字指引線互相打架」的問題。
  const treemapData = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    return rows.map((row, idx) => ({
      name: row.Ticker,
      size: row.Market_Value,
      ratio: row.Ratio,
      color: PALETTE[idx % PALETTE.length],
    }));
  }, [rows]);

  const handleDownloadTreemap = () => {
    const container = containerRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    // 🚀 這裡的 SVG 是 Recharts 產生的，畫面上的字型其實是繼承自外層 Tailwind 的
    // font-sans（不同作業系統會顯示不同字型，例如 Windows 是 Segoe UI）。
    // 但把 SVG 單獨抽出來另存成圖片時，繼承的 CSS 不會一起帶過去，
    // 為了讓下載出來的圖跟其他圖表（長條圖）一樣有一致、可預期的字型，
    // 這裡複製一份節點，直接把字型「烤」進 SVG 本身再序列化，不影響畫面上原本的顯示。
    const svgClone = svg.cloneNode(true);
    svgClone.setAttribute('font-family', 'sans-serif');

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement("canvas");
    const img = new Image();

    const scale = 2;
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight;
    const titleSpace = 40;
    // 跟畫面上容器的 padding 保持一致（top/right/bottom/left），
    // 這樣下載出來的圖也會有一樣的留白，不會讓方塊圖貼著邊框。
    const pad = { top: 12, right: 32, bottom: 32, left: 32 };
    const chartWidth = viewWidth - pad.left - pad.right;
    const chartHeight = viewHeight - pad.top - pad.bottom;

    canvas.width = viewWidth * scale;
    canvas.height = (viewHeight + titleSpace) * scale;

    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.textBaseline = "middle";
      ctx.font = "bold 40px sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText("Portfolio Asset Allocation", 24, 50);

      ctx.textBaseline = "alphabetic";
      ctx.scale(scale, scale);
      ctx.drawImage(img, pad.left, titleSpace + pad.top, chartWidth, chartHeight);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "portfolio_asset_allocation.png";
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (!treemapData) return null;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">資產配置方塊圖 (Asset Allocation)</span>
        <button
          onClick={handleDownloadTreemap}
          className="px-4 py-2 bg-yellow-400 text-slate-900 text-xs font-black rounded-xl shadow-md hover:bg-yellow-500 transition-all flex items-center gap-2"
        >
          🖼️ 下載方塊圖 PNG
        </button>
      </div>

      <div
        ref={containerRef}
        className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm"
        style={{ width: '100%', height: '480px', boxSizing: 'border-box', padding: '12px 32px 32px 32px' }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            isAnimationActive={false}
            content={<TreemapCell />}
          />
        </ResponsiveContainer>
      </div>
    </div>
  );
}
