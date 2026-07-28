// src/utils/chartAxis.js
//
// 從 YieldAnalysis.jsx 抽出來的 Y 軸座標軸計算工具。這組函式是純數學計算，
// 不依賴 React 狀態，兩張圖表（收益曲線 / 帳戶總值）共用同一套邏輯。

// 兩張圖表容器目前都是固定 h-[500px]，5 格刻度大約是每格 100px，格線密度看起來還算舒服。
// 拉出成常數，之後如果哪張圖改成不同高度，只要各自傳入不同的 targetTicks 就好，不用動函式本身。
export const Y_AXIS_TARGET_TICKS = 5;

// 找一個「好看」的整數間距（1/2/5 乘上 10 的次方），給定一段數值範圍跟目標刻度數
export function niceStepFromRange(range, targetTicks) {
  const rawStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceResidual;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

// 依 step 大小動態決定要留幾位小數，並用該精度四捨五入——
// 不然 step < 1 時，無條件捨去成整數會讓好幾格刻度變成同一個數字（Y 軸出現重複標籤）。
export function decimalPlacesForStep(step) {
  return Math.max(0, Math.min(4, -Math.floor(Math.log10(step))));
}

export function roundToStep(v, step) {
  const factor = Math.pow(10, decimalPlacesForStep(step));
  return Math.round(v * factor) / factor;
}

export function computeNiceAxis(minVal, maxVal, targetTicks = Y_AXIS_TARGET_TICKS) {
  if (minVal === maxVal) { minVal -= 1; maxVal += 1; }

  const crossesZero = minVal < 0 && maxVal > 0;

  if (!crossesZero) {
    // 資料沒有橫跨 0（同號，例如帳戶總值一定是正數），單純用整體範圍抓一個好看間距即可。
    const step = niceStepFromRange(maxVal - minVal, targetTicks);
    let floor = Math.floor(minVal / step) * step;
    let ceiling = Math.ceil(maxVal / step) * step;
    // 如果算出來的上緣/下緣剛好精準貼齊實際資料的最大/最小值，折線會直接頂到圖表邊框，
    // 視覺上沒有呼吸空間，這裡多留一格。
    if (ceiling - maxVal < step * 0.001) ceiling += step;
    if (minVal - floor < step * 0.001) floor -= step;
    floor = roundToStep(floor, step);
    ceiling = roundToStep(ceiling, step);
    const ticks = [];
    for (let v = floor; v <= ceiling + step * 0.5; v += step) ticks.push(roundToStep(v, step));
    return { ticks, domain: [floor, ceiling] };
  }

  // 🚀 資料橫跨 0：正負兩側「各自」依實際範圍大小抓自己的好看間距，不再共用同一個間距。
  // 不然只要正負其中一邊範圍差很多，量體較小的那一側都可能被迫套用量體大那一側的粗間距，
  // Y 軸就會被硬拉到遠比實際資料深/高的地方，或是量體小的那側只分到 1 格。
  // 這裡改成不管量體大的是正是負，都先讓「量體較大」的那一側決定自己的間距；
  // 量體較小的那一側，只要不是小到可忽略（小於量體大那側一格的一半），就至少給它 3 格。
  const posMag = maxVal;
  const negMag = Math.abs(minVal);
  const totalRange = posMag + negMag;

  const posIsMajor = posMag >= negMag;
  const majorMag = posIsMajor ? posMag : negMag;
  const minorMag = posIsMajor ? negMag : posMag;

  const majorTicksCount = Math.max(3, Math.round(targetTicks * (majorMag / totalRange)));
  const majorStep = niceStepFromRange(majorMag, majorTicksCount);

  const minorNegligible = minorMag < majorStep * 0.5;
  const minorTicksCount = Math.max(3, targetTicks - majorTicksCount);
  const minorStep = minorNegligible ? majorStep : niceStepFromRange(minorMag, minorTicksCount);

  const posStep = posIsMajor ? majorStep : minorStep;
  const negStep = posIsMajor ? minorStep : majorStep;
  const posNegligible = posIsMajor ? false : minorNegligible;
  const negNegligible = posIsMajor ? minorNegligible : false;

  let ceiling;
  if (posNegligible) {
    ceiling = roundToStep(posMag + majorStep * 0.1, majorStep);
  } else {
    ceiling = Math.ceil(posMag / posStep) * posStep;
    if (ceiling - posMag < posStep * 0.001) ceiling += posStep;
    ceiling = roundToStep(ceiling, posStep);
  }

  let floor;
  if (negNegligible) {
    floor = roundToStep(-(negMag + majorStep * 0.1), majorStep);
  } else {
    floor = -(Math.ceil(negMag / negStep) * negStep);
    if (Math.abs(minVal - floor) < negStep * 0.001) floor -= negStep;
    floor = roundToStep(floor, negStep);
  }

  const ticks = [];
  if (!negNegligible) {
    for (let v = floor; v < -negStep * 0.001; v += negStep) ticks.push(roundToStep(v, negStep));
  }
  if (!posNegligible) {
    for (let v = 0; v <= ceiling + posStep * 0.5; v += posStep) ticks.push(roundToStep(v, posStep));
  } else {
    ticks.push(0);
  }

  return { ticks, domain: [floor, ceiling] };
}

// Y 軸刻度用：金額大時縮寫成 125K 這種格式，避免軸上文字太長互相擠壓（不含 $ 符號，軸本身已經是帳戶總值，不需要每格都重複標示幣別）
export function formatCurrencyCompact(val) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 0 }).format(val);
}

// 結算點標籤、Tooltip 用：完整金額，方便對帳
export function formatCurrencyFull(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}
