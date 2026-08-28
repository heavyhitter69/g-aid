"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type WebsiteTheme = "dark" | "light";

const ThemeContext = createContext<{
  theme: WebsiteTheme;
  setTheme: (theme: WebsiteTheme) => void;
}>({
  theme: "dark",
  setTheme: () => {},
});

export function useWebsiteTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<WebsiteTheme>("dark");

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
