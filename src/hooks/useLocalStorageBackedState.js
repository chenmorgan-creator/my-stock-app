// src/hooks/useLocalStorageBackedState.js
//
// 🚀 通用的「掛載時從 localStorage 還原、之後每次變動自動存回」hook。
// FrontendOcrTest / YieldAnalysis 兩邊原本各自寫了三、四份幾乎一模一樣的
// 「讀取 -> 還原 -> 用 isLoaded 擋掉第一次渲染把資料蓋掉 -> 自動存檔」邏輯，
// 統一成一份以後，之後要修 bug 或調整行為（例如加防抖、加版本號遷移）只需要改一個地方。
//
// 用法範例：
//   const [tableData, setTableData, isTableLoaded] = useLocalStorageBackedState(
//     'portfolioTableData',
//     [],
//     { validate: (v) => Array.isArray(v) && v.length > 0 }
//   );
//
//   // 純字串（不需要 JSON.stringify）：
//   const [inputText, setInputText] = useLocalStorageBackedState(
//     'yieldInputTextBackup',
//     DEFAULT_DATA,
//     { serialize: (v) => v, deserialize: (v) => v, validate: (v) => v.trim() !== '' }
//   );

import { useState, useEffect } from 'react';

export function useLocalStorageBackedState(key, initialValue, options = {}) {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    validate,      // (parsedValue) => boolean，決定要不要真的套用還原出來的值
    onRestore,     // (parsedValue) => void，還原成功時的旁路作用（例如顯示狀態訊息）
  } = options;

  const [value, setValue] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // 掛載時還原一次
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const parsed = deserialize(saved);
        if (!validate || validate(parsed)) {
          setValue(parsed);
          if (onRestore) onRestore(parsed);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoaded(true);
    }
    // 只在掛載時執行一次，故意不把 serialize/deserialize/validate/onRestore 放進依賴陣列
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 之後每次變動自動存回（isLoaded 擋掉還沒讀取完成前的那一次渲染，避免用初始值把已存的資料蓋掉）
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(key, serialize(value));
    } catch (error) {
      console.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isLoaded, key]);

  return [value, setValue, isLoaded];
}
