import { useState } from 'react';
import YieldAnalysis from './components/yield/YieldAnalysis';
import FrontendOcrTest from './components/portfolio/FrontendOcrTest';

function App() {
  const [activeTab, setActiveTab] = useState('portfolio');

  return (
    <div style={{ padding: '40px 20px', fontFamily: 'sans-serif', backgroundColor: '#FFFFFF', minHeight: '100vh', color: '#0F172A' }}>

      {/* 強制顯示垂直捲軸，解決切換分頁時的左右跳動問題 */}
      <style>{`
        html, body {
          overflow-y: scroll !important;
        }
      `}</style>

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#0F172A', marginBottom: '8px', textAlign: 'center' }}>
          整合投資平台：量化分析與收益曲線
        </h1>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', margin: '32px 0', borderBottom: '2px solid #E2E8F0', paddingBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('portfolio')}
            style={{
              padding: '12px 24px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', border: 'none', transition: 'all 0.2s',
              backgroundColor: activeTab === 'portfolio' ? '#0F172A' : 'transparent',
              color: activeTab === 'portfolio' ? '#FFFFFF' : '#64748B'
            }}
          >
            📊 投資組合量化分析
          </button>
          <button
            onClick={() => setActiveTab('yield')}
            style={{
              padding: '12px 24px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', border: 'none', transition: 'all 0.2s',
              backgroundColor: activeTab === 'yield' ? '#0F172A' : 'transparent',
              color: activeTab === 'yield' ? '#FFFFFF' : '#64748B'
            }}
          >
            📈 美股收益分析系統
          </button>
        </div>

        {activeTab === 'portfolio' && (
          <div style={{ animation: 'fadeIn 0.4s' }}>
            <FrontendOcrTest />
          </div>
        )}

        {activeTab === 'yield' && (
          <div style={{ animation: 'fadeIn 0.4s' }}>
            <YieldAnalysis />
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
