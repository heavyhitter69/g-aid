"use client";

import { useAppStore } from "@/store/app-store";
import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    
    // Also update data-theme attribute for any other libraries
    root.setAttribute("data-theme", theme);

    // Immediately update background to avoid flash
    root.style.colorScheme = theme;
  }, [theme]);

  return <>{children}</>;
}
