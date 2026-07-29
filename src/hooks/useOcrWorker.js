// src/hooks/useOcrWorker.js
//
// 從 FrontendOcrTest.jsx 抽出來的 OCR worker 生命週期管理：
// - 快取 worker，避免每次辨識都重新下載引擎
// - 元件卸載時自動 terminate，釋放資源
// - 把「前處理 -> 載入/建立 worker -> 設定參數 -> 辨識」整個流程包成一個方法，
//   呼叫端只需要提供圖片來源，以及想在哪些階段更新進度文字/百分比。

import { useRef, useEffect } from 'react';
import { preprocessImageWithCanvas } from '../utils/ocr/imagePreprocess';

// 🚀 效能優化：tesseract.js 是整個 bundle 裡最重的依賴，改成動態 import，
// 只有使用者真的點擊「智慧載入」開始辨識時才會下載這包，
// 不會拖慢一般使用者（例如只用「收益分析」頁籤的人）的首次進站速度。

// 🚀 關鍵修正：一定要用 setParameters 才能真正生效，直接塞進 recognize() 的 options 裡是不會被套用的
const TESSERACT_CHAR_WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,$ \n';
const TESSERACT_PAGE_SEG_MODE = '6';

export function useOcrWorker() {
  const workerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  /**
   * 前處理 + 辨識一張圖片，回傳 tesseract.js 的 result.data。
   * @param {string} imageSrc
   * @param {object} callbacks
   * @param {(stage: 'preprocessing'|'loadingEngine'|'downloadingEngine'|'recognizing') => void} [callbacks.onStageChange]
   * @param {(progress: number) => void} [callbacks.onProgress] 0~1 之間的辨識進度
   */
  const recognizeImage = async (imageSrc, { onStageChange, onProgress } = {}) => {
    onStageChange?.('preprocessing');
    const preprocessedUrl = await preprocessImageWithCanvas(imageSrc);

    onStageChange?.('loadingEngine');
    if (!workerRef.current) {
      onStageChange?.('downloadingEngine');
      const { createWorker } = await import('tesseract.js');
      workerRef.current = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            onStageChange?.('recognizing');
            onProgress?.(m.progress);
          }
        }
      });
    }
    const worker = workerRef.current;

    await worker.setParameters({
      tessedit_char_whitelist: TESSERACT_CHAR_WHITELIST,
      tessedit_pageseg_mode: TESSERACT_PAGE_SEG_MODE
    });

    onStageChange?.('recognizing');
    // 🚀 關鍵修正：v6+ 版本預設只回傳純文字，words/blocks 座標資料要明確用第三個參數要求才會有
    const result = await worker.recognize(preprocessedUrl, {}, { blocks: true });
    return result.data;
  };

  return { recognizeImage };
}
