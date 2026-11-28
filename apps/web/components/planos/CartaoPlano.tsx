"use client";

// Cartão de plano do popup "Planos" — estrutura do modelo enviado pelo dono
// (docs/referencias/modelo-popup-planos.png) com as cores do FilaPro Leads.
// Todo o conteúdo vem do Super Admin (decisão #27).
import { Check, Gift, Sparkles } from "@/components/icons";
import { useState } from "react";
import { formatarReais, maxQuantidade, precoComQuantidade, rotuloQuantidade, semPrecoDeVenda, type PlanoPublico } from "@/lib/planos";

export default function CartaoPlano({ plano, onEscolher, quantidadeInicial = 1 }: { plano: PlanoPublico; onEscolher?: (p: PlanoPublico, quantidade: number) => void; quantidadeInicial?: number }) {
  const d = plano.destaque;
  // Quantidade de números (Individual) ou pacotes de usuários (Empresarial) — decisão #113
  const maxQ = maxQuantidade(plano);
  const [qtd, setQtd] = useState(Math.min(Math.max(1, quantidadeInicial), maxQ));
  const fator = plano.modulo === "EMPRESARIAL" ? qtd : 1;
  // Plano pago ainda sem preço: aparece como "Em breve", sem compra (decisão #111)
  const emBreve = semPrecoDeVenda(plano);
  const preco = emBreve ? "Em breve" : plano.gratis
    ? "Grátis"
    : plano.precoAtual != null
      ? formatarReais(precoComQuantidade(plano.precoAtual, plano.descontos, qtd))
      : plano.personalizado
        ? "Sob consulta"
        : "—";
  const mostraPeriodo = !emBreve && !plano.gratis && plano.precoAtual != null;

  return (
    <article
      className="cartao-plano relative flex flex-col rounded-[24px] p-5 text-[#eaf6ff] min-w-0"
      style={
        d
          ? {
              background: "linear-gradient(160deg, rgba(37,211,102,.20), rgba(45,212,255,.12) 55%, rgba(5,10,20,.85))",
              border: "1px solid rgba(37,211,102,.55)",
              boxShadow: "0 0 0 1px rgba(37,211,102,.25), 0 18px 50px rgba(0,0,0,.45), 0 0 40px rgba(37,211,102,.18)",
            }
          : {
              background: "rgba(255,255,255,.055)",
              border: "1px solid rgba(255,255,255,.12)",
              boxShadow: "0 18px 50px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08)",
            }
      }
    >
      {/* Selo de desconto */}
      <div className="min-h-[24px] flex justify-end">
        {plano.selo && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-extrabold leading-none"
            style={d ? { background: "#25D366", color: "#04120a" } : { background: "rgba(37,211,102,.12)", color: "#7dffb8", border: "1px solid rgba(37,211,102,.35)" }}
          >
            {plano.selo}
          </span>
        )}
      </div>

      <h3 data-parte="titulo" className="font-display text-[20px] font-extrabold leading-tight mt-1 flex items-center gap-1.5">
        {d && <Sparkles size={18} style={{ color: "#7dffb8" }} />}
        {plano.nome}
      </h3>
      {plano.frase && <p data-parte="frase" className="text-[13px] leading-snug mt-1.5 text-slate-300 min-h-[36px]">{plano.frase}</p>}

      {/* Preço */}
      <div className="mt-4 h-[20px] leading-[20px]">
        {/* Preço antigo riscado só vale para 1 (é o preço de um plano, não da quantidade) */}
        {plano.precoAntigo != null && !plano.gratis && !emBreve && qtd === 1 && (
          <span className="text-[13px] leading-[20px] text-slate-400 line-through">{formatarReais(plano.precoAntigo)}</span>
        )}
      </div>
      <div className="flex items-baseline gap-1 h-[38px]">
        <span data-parte="preco" className="font-display text-[32px] font-extrabold leading-none">{preco}</span>
        {mostraPeriodo && <span className="text-[14px] text-slate-300">/{plano.periodo}</span>}
      </div>

      {/* Seletor de quantidade (decisão #113): números de WhatsApp ou usuários; o preço muda na hora */}
      {maxQ > 1 && (
        <div className="mt-2" data-testid="seletor-quantidade">
          <p className="text-[11px] font-bold text-slate-300 mb-1">{plano.modulo === "INDIVIDUAL" ? "Números de WhatsApp" : "Usuários"}</p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: maxQ }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setQtd(n)} aria-pressed={qtd === n} data-testid={`qtd-${n}`}
                className="rounded-lg px-2 py-1 text-[12px] font-extrabold min-w-[34px]"
                style={qtd === n ? { background: "#25D366", color: "#04120a" } : { background: "rgba(255,255,255,.06)", color: "#cfe8dc", border: "1px solid rgba(255,255,255,.14)" }}>
                {plano.modulo === "INDIVIDUAL" ? n : (plano.usuarios ?? 1) * n}
              </button>
            ))}
          </div>
          {!emBreve && qtd > 1 && <p className="text-[10.5px] text-slate-400 mt-1" data-testid="rotulo-quantidade">{rotuloQuantidade(plano, qtd)}</p>}
        </div>
      )}

      {/* Disparos do plano (decisão #111): quantidade por período ou sem limite */}
      {!plano.gratis && !plano.personalizado && (
        <p data-parte="disparos" className="mt-2 text-[12.5px] font-bold rounded-lg px-2.5 py-1.5" data-testid="disparos-plano"
          style={{ background: "rgba(45,212,255,.08)", color: "#9fefff", border: "1px solid rgba(45,212,255,.25)" }}>
          {plano.disparosPorPeriodo
            ? <>{(plano.disparosPorPeriodo * fator).toLocaleString("pt-BR")} disparos/{plano.periodo}{plano.pacoteDisparos ? <span className="font-semibold text-slate-300"> • extra: {plano.pacoteDisparos.toLocaleString("pt-BR")}{plano.precoPacoteDisparos ? ` por ${formatarReais(plano.precoPacoteDisparos)}` : ""}</span> : null}</>
            : plano.permiteDisparos === false ? <>Sem disparos de campanha (só mensal)</> : <>Disparos sem limite no período</>}
        </p>
      )}

      <button
        type="button"
        onClick={() => { if (!emBreve) onEscolher?.(plano, qtd); }}
        disabled={emBreve}
        data-testid={emBreve ? "plano-em-breve" : undefined}
        data-parte="botao"
        className={emBreve ? "mt-5 w-full rounded-xl py-3 text-[15px] font-bold cursor-not-allowed" : d ? "login-cta mt-5 !py-3 !text-[15px]" : "mt-5 w-full rounded-xl py-3 text-[15px] font-bold"}
        style={emBreve ? { border: "1px solid rgba(255,255,255,.18)", color: "#9fb3c8", background: "rgba(255,255,255,.05)" } : d ? undefined : { border: "1px solid #2dd4ff", color: "#7fe7ff", background: "rgba(45,212,255,.06)" }}
      >
        {emBreve ? "Em breve" : plano.textoBotao || "Escolher plano"}
      </button>

      {plano.condicoes && <p data-parte="condicoes" className="text-[11.5px] leading-relaxed mt-4 text-slate-400 whitespace-pre-line">{plano.condicoes}</p>}

      {(plano.ofertaTexto || plano.recursos.length > 0) && <div className="h-px w-full my-4" style={{ background: "rgba(255,255,255,.12)" }} />}

      {plano.ofertaTexto && (
        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,.06)" }}>
          <p className="text-[13px] leading-snug flex-1 whitespace-pre-line">{plano.ofertaTexto}</p>
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "#25D366", color: "#04120a" }}>
            <Gift size={20} />
          </span>
        </div>
      )}

      {plano.recursos.length > 0 && (
        <ul className="mt-4 space-y-2">
          {plano.recursos.map((r, i) => (
            <li key={i} data-parte="recurso" className="flex gap-2 text-[13px] leading-snug">
              <Check size={16} className="shrink-0 mt-0.5" style={{ color: "#25D366" }} />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
