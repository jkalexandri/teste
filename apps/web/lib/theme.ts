"use client";

// Tema claro é o padrão. A preferência fica salva no navegador.
// O botão lua/sol aplica o tema na tela inteira (atributo data-theme no <html>).
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
import { THEME_KEY } from "./theme-key";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  // Lê a preferência salva ao abrir a página.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {
      /* navegador sem acesso ao armazenamento: mantém o padrão */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignora */
    }
  }

  return { theme, toggleTheme };
}
