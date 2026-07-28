// src/utils/ocr/imagePreprocess.js
//
// 從 FrontendOcrTest.jsx 抽出來的截圖前處理邏輯（放大 + Otsu 自動二值化）。
// 純粹操作 canvas 像素資料，不依賴任何 React 狀態，方便獨立測試或未來重用。

// Otsu's method：自動找出讓「前景/背景」兩群像素的組內變異數最小（組間變異數最大）的門檻值
export function computeOtsuThreshold(grayValues) {
  const histogram = new Array(256).fill(0);
  for (let j = 0; j < grayValues.length; j++) {
    histogram[grayValues[j]]++;
  }

  const total = grayValues.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (weightB === 0) continue;

    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const betweenVariance = weightB * weightF * (meanB - meanF) * (meanB - meanF);

    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      threshold = t;
    }
  }

  return threshold;
}

// 放大 + 灰階 + Otsu 二值化，回傳處理完成的 data URL（PNG）
export function preprocessImageWithCanvas(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      // 🚀 放大倍率：截圖裡的小字放大後，OCR 引擎能抓到更多筆畫細節
      // 若原圖本身就很小（例如截圖只有一兩百像素寬），會自動再加碼放大，
      // 確保數字/文字送進 OCR 引擎前的實際字高不會小於安全門檻，
      // 避免像「6」被誤判成「4」這類極小字體才會出現的辨識錯誤
      const MIN_TARGET_WIDTH = 900; // 期望前處理後的最小寬度
      const baseScale = 2;
      const autoBoostScale = Math.max(baseScale, Math.ceil(MIN_TARGET_WIDTH / img.width));
      const scaleFactor = Math.min(autoBoostScale, 6); // 上限 6 倍，避免圖片過大拖慢辨識
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width * scaleFactor;
      canvas.height = img.height * scaleFactor;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const pixelCount = data.length / 4;
      const grayValues = new Uint8ClampedArray(pixelCount);

      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        grayValues[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      // 🚀 Otsu 自動門檻值：不再寫死 90，依照每張截圖自己的明暗分布動態計算最佳黑白分界
      const threshold = computeOtsuThreshold(grayValues);

      // 🚀 自動判斷文字是「深色文字淺色底」還是「淺色文字深色底」：
      // 假設文字筆畫占的像素數量一定比背景少，用像素數量較少的那一組當作文字
      let belowCount = 0;
      for (let j = 0; j < pixelCount; j++) {
        if (grayValues[j] <= threshold) belowCount++;
      }
      const aboveCount = pixelCount - belowCount;
      const textIsBelowThreshold = belowCount <= aboveCount;

      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const isTextPixel = grayValues[j] <= threshold ? textIsBelowThreshold : !textIsBelowThreshold;
        const finalColor = isTextPixel ? 0 : 255;
        data[i] = finalColor;
        data[i + 1] = finalColor;
        data[i + 2] = finalColor;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
  });
}
