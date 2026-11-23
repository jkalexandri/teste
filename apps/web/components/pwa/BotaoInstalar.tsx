"use client";

// Botão "Instalar app" do login, só no celular e só se o app ainda não estiver instalado (decisão #112).
// Android/Chrome: abre a janela de instalação do Chrome. iPhone: passo a passo do Safari.
// Navegador de dentro do WhatsApp/Instagram/Facebook: orienta abrir no Chrome ou no Safari.
import { useEffect, useState } from "react";
import { Download, X } from "@/components/icons";

type Caso = "android" | "iphone" | "iphone-outro" | "app-interno" | "outro";

function detectar(): { celular: boolean; instalado: boolean; caso: Caso } {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const interno = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);
  const caso: Caso = interno ? "app-interno" : ios ? (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "iphone-outro" : "iphone") : android ? "android" : "outro";
  return { celular: ios || android, instalado, caso };
}

export default function BotaoInstalar() {
  const [info, setInfo] = useState<ReturnType<typeof detectar> | null>(null);
  const [pronto, setPronto] = useState(false); // Chrome já ofereceu a instalação
  const [ajuda, setAjuda] = useState(false);

  useEffect(() => {
    setInfo(detectar());
    setPronto(!!window.__filaproInstalar);
    const ok = () => setPronto(true);
    const fim = () => setInfo((i) => (i ? { ...i, instalado: true } : i));
    window.addEventListener("filapro-instalavel", ok);
    window.addEventListener("filapro-instalado", fim);
    return () => { window.removeEventListener("filapro-instalavel", ok); window.removeEventListener("filapro-instalado", fim); };
  }, []);

  if (!info || !info.celular || info.instalado) return null;

  async function instalar() {
    const pedido = window.__filaproInstalar;
    if (pedido) {
      await pedido.prompt();
      const r = await pedido.userChoice.catch(() => ({ outcome: "dismissed" }));
      if (r.outcome === "accepted") { window.__filaproInstalar = null; setInfo((i) => (i ? { ...i, instalado: true } : i)); }
      return;
    }
    setAjuda(true);
  }

  const passos: Record<Caso, { titulo: string; itens: string[] }> = {
    android: { titulo: "Instalar no Android", itens: ["Toque nos três pontinhos ⋮ no canto de cima do Chrome.", "Toque em “Instalar app” ou “Adicionar à tela inicial”.", "Confirme em “Instalar”. O ícone do FilaPro Leads aparece na tela do celular."] },
    iphone: { titulo: "Instalar no iPhone", itens: ["Toque no botão Compartilhar (quadrado com a seta para cima), embaixo da tela.", "Role e toque em “Adicionar à Tela de Início”.", "Toque em “Adicionar”. O ícone do FilaPro Leads aparece na tela do celular."] },
    "iphone-outro": { titulo: "Abra no Safari", itens: ["No iPhone, só o Safari instala apps de sites.", "Copie o endereço filaproleads.com.br e abra no Safari.", "Depois toque em Compartilhar → “Adicionar à Tela de Início”."] },
    "app-interno": { titulo: "Abra no navegador do celular", itens: ["Você abriu o link por dentro de outro app (WhatsApp, Instagram ou Facebook), que não instala apps.", "Toque nos três pontinhos (ou em “Abrir no navegador”) e escolha Chrome (Android) ou Safari (iPhone).", "Depois toque de novo em “Instalar app”."] },
    outro: { titulo: "Instalar o app", itens: ["Abra filaproleads.com.br no Chrome (Android) ou no Safari (iPhone).", "Use o menu do navegador: “Instalar app” ou “Adicionar à Tela de Início”."] },
  };
  const p = passos[info.caso];

  return (
    <>
      <button type="button" onClick={instalar} data-testid="botao-instalar-app"
        className="rounded-xl px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1.5"
        style={{ background: "rgba(37,211,102,.14)", color: "#7dffb8", border: "1px solid rgba(37,211,102,.45)" }}>
        <Download size={13} /> Instalar app
      </button>
      {ajuda && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3" style={{ background: "rgba(3,6,14,.72)", backdropFilter: "blur(6px)" }}
          role="dialog" aria-modal="true" aria-label={p.titulo} onClick={() => setAjuda(false)} data-testid="ajuda-instalar">
          <div className="login-glass rounded-[18px] p-4 w-full max-w-[380px] text-[#eaf6ff]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <b className="text-[15px]">{p.titulo}</b>
              <button type="button" onClick={() => setAjuda(false)} aria-label="Fechar" className="login-ghost-btn !p-1.5"><X size={14} /></button>
            </div>
            <ol className="mt-3 grid gap-2 text-[13px] leading-snug">
              {p.itens.map((t, i) => (
                <li key={i} className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-[11px] font-extrabold flex items-center justify-center" style={{ background: "#25D366", color: "#04120a" }}>{i + 1}</span><span>{t}</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
