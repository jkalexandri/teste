"use client";

// Popup "Planos" aberto pelo botão do login (decisões #25 e #27).
// Mostra só os planos marcados como visíveis pelo Super Admin; a largura e o
// número de colunas se ajustam à quantidade de planos.
import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { ABAS_PLANOS, abasDoPlano, linkContato, type AbaPlanos, type PlanoPublico } from "@/lib/planos";
import CartaoPlano from "./CartaoPlano";
import Checkout from "./Checkout";
import ChatInteressado from "./ChatInteressado";

type Dados = { planos: PlanoPublico[]; contatoPersonalizado: string };

/** Grade que se ajusta: até 4 cartões lado a lado; acima disso, quebra em linhas centralizadas (sem rolagem lateral escondida).
 *  No celular, um cartão embaixo do outro. */
export function GradePlanos({ planos, onEscolher }: { planos: PlanoPublico[]; onEscolher?: (p: PlanoPublico) => void }) {
  const n = Math.max(1, planos.length);
  if (n > 4) {
    return (
      <div className="flex flex-wrap justify-center gap-4 mx-auto max-w-[1320px]" data-testid="grade-planos">
        {planos.map((p) => (
          <div key={p.id} className="w-full sm:w-[300px] flex">
            <div className="flex-1 min-w-0 flex flex-col [&>article]:flex-1"><CartaoPlano plano={p} onEscolher={onEscolher} /></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto no-scrollbar pb-1" data-testid="grade-planos">
      <div
        className="grid gap-4 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${n}, minmax(260px, 1fr))`,
          maxWidth: `${n * 320}px`,
        }}
      >
        {planos.map((p) => (
          <CartaoPlano key={p.id} plano={p} onEscolher={onEscolher} />
        ))}
      </div>
    </div>
  );
}

/** Planos em duas abas largas: Sem limite / Por quantidade de disparos (decisão #111).
 *  Se só uma das abas tem planos próprios, mostra só a grade, sem abas. */
export function PlanosComAbas({ planos, onEscolher }: { planos: PlanoPublico[]; onEscolher?: (p: PlanoPublico) => void }) {
  const [aba, setAba] = useState<AbaPlanos>("ilimitado");
  const proprios = (a: AbaPlanos) => planos.filter((p) => !p.gratis && !p.personalizado && abasDoPlano(p).includes(a)).length;
  const comAbas = proprios("ilimitado") > 0 && proprios("quantidade") > 0;
  if (!comAbas) return <GradePlanos planos={planos} onEscolher={onEscolher} />;
  const daAba = planos.filter((p) => abasDoPlano(p).includes(aba));
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 max-w-[900px] mx-auto" role="tablist" aria-label="Tipo de plano">
        {ABAS_PLANOS.map((a) => {
          const ativa = a.id === aba;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={ativa} data-testid={`aba-planos-${a.id}`} onClick={() => setAba(a.id)}
              className="rounded-2xl px-3 py-3 sm:px-5 sm:py-4 text-left transition"
              style={ativa
                ? { background: "linear-gradient(135deg, rgba(37,211,102,.28), rgba(45,212,255,.18))", border: "1px solid rgba(37,211,102,.7)", boxShadow: "0 0 28px rgba(37,211,102,.25)", color: "#eaf6ff" }
                : { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", color: "#9fb3c8" }}>
              <span className="block font-display font-extrabold text-[14px] sm:text-[18px] leading-tight">{a.icone} {a.titulo}</span>
              <span className="block text-[11px] sm:text-[13px] mt-0.5" style={{ color: ativa ? "#bfe8d0" : "#7f93a8" }}>{a.frase}</span>
            </button>
          );
        })}
      </div>
      <GradePlanos planos={daAba} onEscolher={onEscolher} />
    </>
  );
}

export default function PopupPlanos({ onFechar }: { onFechar: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aviso, setAviso] = useState("");
  const [escolhido, setEscolhido] = useState<PlanoPublico | null>(null);
  // Chat para interessados (decisão #104)
  const [chat, setChat] = useState(false);

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
    setAviso("");
    setEscolhido(p);
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
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setChat(true)} className="login-ghost-btn !py-2 !px-3 text-[12px] font-bold" data-testid="fale-conosco">💬 Fale conosco</button>
            <button onClick={onFechar} className="login-ghost-btn !p-2" aria-label="Fechar planos">
              <X size={16} />
            </button>
          </div>
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
        ) : escolhido ? (
          <Checkout plano={escolhido} onVoltar={() => setEscolhido(null)} />
        ) : (
          <PlanosComAbas planos={dados.planos} onEscolher={escolher} />
        )}
      </div>
      {chat && <ChatInteressado onFechar={() => setChat(false)} />}
    </div>
  );
}
