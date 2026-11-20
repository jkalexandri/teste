"use client";

// Popup "Planos" aberto pelo botão do login (decisões #25 e #27).
// Mostra só os planos marcados como visíveis pelo Super Admin; a largura e o
// número de colunas se ajustam à quantidade de planos.
import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { linkContato, type PlanoPublico } from "@/lib/planos";
import CartaoPlano from "./CartaoPlano";

type Dados = { planos: PlanoPublico[]; contatoPersonalizado: string };

/** Grade que se ajusta: até 4 colunas lado a lado; acima disso, rolagem lateral. */
export function GradePlanos({ planos, onEscolher }: { planos: PlanoPublico[]; onEscolher?: (p: PlanoPublico) => void }) {
  const n = Math.max(1, planos.length);
  return (
    <div className="overflow-x-auto no-scrollbar pb-1">
      <div
        className="grid gap-4 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${n}, minmax(260px, 1fr))`,
          maxWidth: n <= 4 ? `${n * 320}px` : undefined,
        }}
      >
        {planos.map((p) => (
          <CartaoPlano key={p.id} plano={p} onEscolher={onEscolher} />
        ))}
      </div>
    </div>
  );
}

export default function PopupPlanos({ onFechar }: { onFechar: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    fetch("/api/planos")
      .then((r) => r.json())
      .then(setDados)
      .catch(() => setDados({ planos: [], contatoPersonalizado: "" }));
  }, []);

  // Fecha com Esc
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onFechar]);

  function escolher(p: PlanoPublico) {
    if (p.personalizado) {
      const link = linkContato(dados?.contatoPersonalizado || "");
      if (link) {
        window.open(link, "_blank", "noopener,noreferrer");
        return;
      }
      setAviso(dados?.contatoPersonalizado ? `Fale conosco: ${dados.contatoPersonalizado}` : "Contato ainda não configurado.");
      return;
    }
    // TODO etapa 4b: dados do comprador → PIX → pedido (Free: conta criada na hora).
    setAviso(`Plano ${p.nome}: a compra por PIX será liberada na próxima entrega (etapa 4b).`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      style={{ background: "rgba(3,6,14,.78)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Planos"
      onClick={onFechar}
    >
      <div className="w-full max-w-[1320px] my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[24px] font-extrabold text-white">Planos</h2>
          <button onClick={onFechar} className="login-ghost-btn !p-2" aria-label="Fechar planos">
            <X size={16} />
          </button>
        </div>
        {aviso && (
          <div className="mb-3 rounded-xl p-2.5 text-[12px] font-semibold text-emerald-300" style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.30)" }}>
            {aviso}
          </div>
        )}
        {!dados ? (
          <p className="text-[13px] text-slate-400">Carregando planos…</p>
        ) : dados.planos.length === 0 ? (
          <div className="login-glass rounded-[18px] p-5 text-[13px] text-slate-300">Nenhum plano disponível no momento.</div>
        ) : (
          <GradePlanos planos={dados.planos} onEscolher={escolher} />
        )}
      </div>
    </div>
  );
}
