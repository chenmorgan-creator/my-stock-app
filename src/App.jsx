import { useState, lazy, Suspense } from 'react';

// 🚀 效能優化：兩個分頁各自都會拉入 recharts（含 d3，未壓縮原始碼將近 9.4MB，是目前 bundle 裡最重的部分）。
// 改成 lazy 動態載入後，一開始只會載入使用者實際打開的那個分頁，切換分頁時才載入另一個分頁的程式碼，
// 而不是不管使用者看不看，兩個分頁的程式碼都先下載好。
const YieldAnalysis = lazy(() => import('./components/yield/YieldAnalysis'));
const FrontendOcrTest = lazy(() => import('./components/portfolio/FrontendOcrTest'));

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400 font-medium">
      ⏳ 載入中...
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('portfolio');

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans px-4 py-8 sm:px-6 sm:py-10">

      {/* 強制顯示垂直捲軸，解決切換分頁時的左右跳動問題 */}
      <style>{`
        html, body {
          overflow-y: scroll !important;
        }
      `}</style>

      <div className="max-w-[1000px] mx-auto">

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 text-center leading-snug">
          整合投資平台：量化分析與收益曲線
        </h1>

        <div className="flex flex-wrap justify-center gap-3 sm:gap-4 my-6 sm:my-8 pb-4">
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl text-sm sm:text-base font-bold cursor-pointer transition-all shadow-sm ${
              activeTab === 'portfolio'
                ? 'bg-slate-900 text-white border-2 border-slate-900 shadow-md'
                : 'bg-white text-slate-500 border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            📊 投資組合量化分析
          </button>
          <button
            onClick={() => setActiveTab('yield')}
            className={`px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl text-sm sm:text-base font-bold cursor-pointer transition-all shadow-sm ${
              activeTab === 'yield'
                ? 'bg-slate-900 text-white border-2 border-slate-900 shadow-md'
                : 'bg-white text-slate-500 border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            📈 美股收益分析系統
          </button>
        </div>

        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'portfolio' && (
            <div className="animate-in fade-in duration-300">
              <FrontendOcrTest />
            </div>
          )}

          {activeTab === 'yield' && (
            <div className="animate-in fade-in duration-300">
              <YieldAnalysis />
            </div>
          )}
        </Suspense>

      </div>
    </div>
  );
}

export default App;
