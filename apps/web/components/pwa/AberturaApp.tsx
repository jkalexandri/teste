"use client";

// Tela de abertura do app instalado (decisão #86): ícone animado por ~1,4 s, uma vez por sessão.
// Só aparece quando o FilaPro Leads é aberto pela tela inicial do celular (modo app) — no navegador nada muda.
import { useEffect, useState } from "react";
import IconeAnimado from "./IconeAnimado";

export default function AberturaApp() {
  const [mostrar, setMostrar] = useState(false);
  const [saindo, setSaindo] = useState(false);
  useEffect(() => {
    let ja = false;
    try { ja = sessionStorage.getItem("fp-abertura") === "1"; sessionStorage.setItem("fp-abertura", "1"); } catch { /* sem armazenamento */ }
    const app = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!app || ja) return;
    setMostrar(true);
    const t1 = setTimeout(() => setSaindo(true), 1400);
    const t2 = setTimeout(() => setMostrar(false), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!mostrar) return null;
  return (
    <div className="abertura-app" data-saindo={saindo ? "1" : undefined} aria-hidden="true" data-testid="abertura-app">
      <IconeAnimado tamanho={132} />
      <div className="abertura-nome"><span className="login-neon-text">FilaPro Leads</span><span style={{ color: "#25D366" }}>.</span></div>
    </div>
  );
}
