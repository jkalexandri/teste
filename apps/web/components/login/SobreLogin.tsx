"use client";

// "Sobre" do login (decisão #189): o texto vem do que o Super Admin escreveu em Planos; vazio = texto padrão (o que já existia no login).
import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { VERSAO } from "@/lib/versao";
import { SOBRE_PADRAO, paragrafos } from "@/lib/sobre";

export default function SobreLogin({ onFechar }: { onFechar: () => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onFechar]);
  useEffect(() => {
    fetch("/api/sobre", { cache: "no-store" }).then((r) => r.json()).then((r) => setTexto(String(r.texto ?? ""))).catch(() => setTexto(""));
  }, []);
  const blocos = paragrafos(texto === null ? "" : texto.trim() ? texto : SOBRE_PADRAO);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto" style={{ background: "rgba(3,6,14,.78)", backdropFilter: "blur(6px)" }}
      role="dialog" aria-modal="true" aria-label="Sobre o FilaPro Leads" onClick={onFechar} data-testid="popup-sobre">
      <div className="login-glass rounded-[18px] p-5 w-full max-w-[560px] max-h-[88vh] overflow-y-auto text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-[22px] font-extrabold text-white">FilaPro Leads</h2>
          <button onClick={onFechar} className="login-ghost-btn !p-2" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="mt-2 grid gap-2.5 text-[13px] leading-relaxed" data-testid="sobre-texto">
          {texto === null ? <p className="text-slate-400">Carregando…</p> : blocos.map((p, i) => (
            <p key={i} className={i === 0 && !texto.trim() ? "font-display font-extrabold text-[16px] text-white" : undefined}>
              {p.map((t, j) => t.tipo === "link"
                ? <a key={j} className="underline text-[#7fe4ff]" href={t.valor} target="_blank" rel="noopener noreferrer">{t.valor}</a>
                : <span key={j} className="whitespace-pre-wrap">{t.valor}</span>)}
            </p>
          ))}
        </div>
        <p className="text-[12px] mt-4 text-slate-300">
          <a className="underline" href="/termos" target="_blank" rel="noopener noreferrer">Termos de uso</a> · <a className="underline" href="/privacidade" target="_blank" rel="noopener noreferrer">Política de privacidade</a>
        </p>
        <p className="text-[11px] mt-2 text-slate-400">by Jackson Alexandrino · v{VERSAO}</p>
      </div>
    </div>
  );
}
