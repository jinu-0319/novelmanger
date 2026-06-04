"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";

/**
 * Zustand 스토어의 darkMode 상태를 <html> 클래스와 동기화합니다.
 * layout.tsx에서 최상단에 마운트하여 앱 전체에 적용됩니다.
 */
export default function DarkModeSync() {
  const darkMode = useStore((s) => s.darkMode);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  return null;
}
