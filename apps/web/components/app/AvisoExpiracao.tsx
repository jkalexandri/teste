"use client";

// Aviso de expiração (prompt seção 7): 10 dias antes de expirar, popup de
// 10 segundos mostrando o tempo restante. "Não mostrar hoje" esconde até amanhã.
import { useEffect, useState } from "react";
import { TriangleAlert, X } from "@/components/icons";

const DURACAO_MS = 10000;
const CHAVE_OCULTO = "filapro-aviso-expiracao-oculto";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AvisoExpiracao({ dias, expiraEm, souAdmin }: { dias: number; expiraEm: string; souAdmin?: boolean }) {
  const [visivel, setVisivel] = useState(false);
  const [restante, setRestante] = useState(DURACAO_MS);

  useEffect(() => {
    if (dias > 10 || dias < 0) return;
    try {
      if (localStorage.getItem(CHAVE_OCULTO) === hojeISO()) return;
    } catch {
      /* ignora */
    }
    setVisivel(true);
  }, [dias]);

  useEffect(() => {
    if (!visivel) return;
    const inicio = Date.now();
    const t = window.setInterval(() => {
      const r = Math.max(0, DURACAO_MS - (Date.now() - inicio));
      setRestante(r);
      if (r <= 0) {
        window.clearInterval(t);
        setVisivel(false);
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [visivel]);

  if (!visivel) return null;
  const critico = dias <= 3;
  const data = new Date(expiraEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  function naoMostrarHoje() {
    try {
      localStorage.setItem(CHAVE_OCULTO, hojeISO());
    } catch {
      /* ignora */
    }
    setVisivel(false);
  }

  return (
    <div
      className="fixed bottom-3 right-3 z-50 w-[calc(100vw-1.5rem)] max-w-[340px] card p-3"
      role="status"
      aria-live="polite"
      style={{ boxShadow: "0 12px 32px rgba(0,0,0,.22)" }}
    >
      <div className="flex gap-2.5">
        <div
          className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
          style={{ background: critico ? "#ffeef0" : "#fff7e0", color: critico ? "#9e1d2f" : "#8a5a00" }}
        >
          <TriangleAlert size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <b className="text-[12px] leading-snug">
              {dias === 0 ? `Seu acesso expira hoje (${data}).` : `Seu acesso expira em ${dias} ${dias === 1 ? "dia" : "dias"} (${data}).`}
            </b>
            <button onClick={() => setVisivel(false)} className="shrink-0" aria-label="Fechar aviso" style={{ color: "var(--muted)" }}>
              <X size={14} />
            </button>
          </div>
          <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>
            {souAdmin ? "Renove pelo link enviado para o seu e-mail." : "Fale com o administrador para renovar."}
          </p>
        </div>
      </div>
      <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${(restante / DURACAO_MS) * 100}%`, background: critico ? "#e5484d" : "#f59e0b", transition: "width 100ms linear" }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>
          Fecha em {Math.ceil(restante / 1000)}s
        </span>
        <div className="flex gap-1.5">
          <button className="btn-ghost !py-1 !px-2 text-[11px]" onClick={naoMostrarHoje}>Não mostrar hoje</button>
          <button className="btn-primary !py-1 !px-2.5 text-[11px]" onClick={() => setVisivel(false)}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
