"use client";

// "Sobre" do login (decisão #186): só reaproveita os textos que já existem na tela de login e os links dos documentos legais.
import { useEffect } from "react";
import { X } from "@/components/icons";
import { VERSAO } from "@/lib/versao";

export default function SobreLogin({ onFechar }: { onFechar: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onFechar]);
  const blocos = [
    ["Antibloqueio Inteligente", "Cadência, blocos e pausas que protegem sua conta."],
    ["IA que Atende, Contorna Objeções e Qualifica", "Conversas com contexto do seu negócio."],
    ["Online na Nuvem 24/7", "Seus envios seguem a cadência definida, sem parar."],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto" style={{ background: "rgba(3,6,14,.78)", backdropFilter: "blur(6px)" }}
      role="dialog" aria-modal="true" aria-label="Sobre o FilaPro Leads" onClick={onFechar} data-testid="popup-sobre">
      <div className="login-glass rounded-[18px] p-5 w-full max-w-[520px] text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-[22px] font-extrabold text-white">FilaPro Leads</h2>
          <button onClick={onFechar} className="login-ghost-btn !p-2" aria-label="Fechar"><X size={16} /></button>
        </div>
        <p className="font-display font-extrabold text-[16px] text-white mt-1">O futuro do disparo inteligente.</p>
        <p className="text-[13px] mt-1">Envios com ritmo, contexto e proteção: sua operação de WhatsApp pronta para escalar sem perder o controle.</p>
        <ul className="mt-3 grid gap-2">
          {blocos.map(([t, d]) => (
            <li key={t} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)" }}>
              <b className="block text-[13px] text-white">{t}</b><span className="text-[12px] text-slate-300">{d}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] mt-3 text-slate-300">
          <a className="underline" href="/termos" target="_blank" rel="noopener noreferrer">Termos de uso</a> · <a className="underline" href="/privacidade" target="_blank" rel="noopener noreferrer">Política de privacidade</a>
        </p>
        <p className="text-[11px] mt-2 text-slate-400">by Jackson Alexandrino · v{VERSAO}</p>
      </div>
    </div>
  );
}
