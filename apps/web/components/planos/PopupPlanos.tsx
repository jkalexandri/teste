"use client";

// Popup "Planos" aberto pelo botão do login (decisões #25 e #27).
// Mostra só os planos marcados como visíveis pelo Super Admin; a largura e o
// número de colunas se ajustam à quantidade de planos.
import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import { ABAS_PLANOS, MODULOS_PLANOS, abasDoPlano, linkContato, type AbaPlanos, type ModuloPlano, type PlanoPublico } from "@/lib/planos";
import CartaoPlano from "./CartaoPlano";
import Checkout from "./Checkout";
import ChatInteressado from "./ChatInteressado";

type Dados = { planos: PlanoPublico[]; contatoPersonalizado: string };

/** Grade que se ajusta: até 4 cartões lado a lado; acima disso, quebra em linhas centralizadas (sem rolagem lateral escondida).
 *  No celular, um cartão embaixo do outro. */
export function GradePlanos({ planos, onEscolher, quantidadeInicial }: { planos: PlanoPublico[]; onEscolher?: (p: PlanoPublico, quantidade: number) => void; quantidadeInicial?: number }) {
  const n = Math.max(1, planos.length);
  if (n > 4) {
    // Telas largas: todos na mesma linha, em versão compacta; telas estreitas: quebra em linhas (globals.css → .grade-muitos)
    return (
      <div className="grade-muitos flex flex-wrap justify-center gap-4 mx-auto max-w-[1320px]" style={{ ["--n" as string]: n } as React.CSSProperties} data-testid="grade-planos">
        {planos.map((p) => (
          <div key={p.id} className="w-full sm:w-[300px] flex">
            <div className="flex-1 min-w-0 flex flex-col [&>article]:flex-1"><CartaoPlano plano={p} onEscolher={onEscolher} quantidadeInicial={quantidadeInicial} /></div>
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
          <CartaoPlano key={p.id} plano={p} onEscolher={onEscolher} quantidadeInicial={quantidadeInicial} />
        ))}
      </div>
    </div>
  );
}

/** Botão de aba larga (decisões #111 e #113) */
function Aba({ ativa, onClick, titulo, frase, testid, grande }: { ativa: boolean; onClick: () => void; titulo: string; frase: string; testid: string; grande?: boolean }) {
  return (
    <button type="button" role="tab" aria-selected={ativa} data-testid={testid} onClick={onClick}
      className={`rounded-2xl text-left transition ${grande ? "px-3 py-3 sm:px-5 sm:py-4" : "px-3 py-2 sm:px-4 sm:py-2.5"}`}
      style={ativa
        ? { background: "linear-gradient(135deg, rgba(37,211,102,.28), rgba(45,212,255,.18))", border: "1px solid rgba(37,211,102,.7)", boxShadow: "0 0 28px rgba(37,211,102,.25)", color: "#eaf6ff" }
        : { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", color: "#9fb3c8" }}>
      <span className={`block font-display font-extrabold leading-tight ${grande ? "text-[15px] sm:text-[19px]" : "text-[13px] sm:text-[15px]"}`}>{titulo}</span>
      <span className={`block mt-0.5 ${grande ? "text-[11px] sm:text-[13px]" : "text-[10.5px] sm:text-[12px]"}`} style={{ color: ativa ? "#bfe8d0" : "#7f93a8" }}>{frase}</span>
    </button>
  );
}

/** Planos em abas (decisão #113): Individual | Empresarial e, em cada um, Mensal | Por disparo.
 *  Uma aba só aparece se tiver planos; se só houver um tipo, mostra direto a grade. */
export function PlanosComAbas({ planos, onEscolher, quantidadeInicial, fixarAbas }: { planos: PlanoPublico[]; onEscolher?: (p: PlanoPublico, quantidade: number) => void; quantidadeInicial?: number; fixarAbas?: boolean }) {
  const modulos = MODULOS_PLANOS.filter((m) => planos.some((p) => p.modulo === m.id));
  const [modulo, setModulo] = useState<ModuloPlano>(modulos[0]?.id ?? "INDIVIDUAL");
  const [aba, setAba] = useState<AbaPlanos>("ilimitado");
  const doModulo = planos.filter((p) => p.modulo === modulo);
  // Tipos com planos próprios (o Free sozinho não cria aba)
  const tipos = ABAS_PLANOS.filter((a) => doModulo.some((p) => !p.gratis && !p.personalizado && abasDoPlano(p).includes(a.id)));
  const abaAtual = tipos.some((t) => t.id === aba) ? aba : tipos[0]?.id ?? "ilimitado";
  const daAba = tipos.length > 1 ? doModulo.filter((p) => abasDoPlano(p).includes(abaAtual)) : doModulo;
  const nomeModulo = MODULOS_PLANOS.find((m) => m.id === modulo)?.titulo ?? "";
  return (
    <>
      {/* Celular: abas fixas no topo do popup ao rolar (decisão #119), para trocar de aba de qualquer ponto da lista.
          No computador (sm ou maior) fica como antes, sem fundo e sem fixar. */}
      <div
        className={fixarAbas ? "sticky -top-3 z-10 -mx-3 px-3 pt-3 pb-1 bg-[rgba(3,6,14,.96)] backdrop-blur-[8px] sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:backdrop-blur-none" : undefined}
        data-testid={fixarAbas ? "abas-fixas" : undefined}
      >
      {modulos.length > 1 && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2.5 max-w-[900px] mx-auto" role="tablist" aria-label="Tipo de conta">
          {modulos.map((m) => (
            <Aba key={m.id} grande ativa={m.id === modulo} onClick={() => { setModulo(m.id); setAba("ilimitado"); }} titulo={`${m.icone} ${m.titulo}`} frase={m.frase} testid={`aba-modulo-${m.id}`} />
          ))}
        </div>
      )}
      {tipos.length > 1 && (
        <div className="grid grid-cols-2 gap-2 mb-4 max-w-[640px] mx-auto" role="tablist" aria-label="Forma de cobrança">
          {tipos.map((a) => (
            <Aba key={a.id} ativa={a.id === abaAtual} onClick={() => setAba(a.id)} titulo={`${a.icone} ${nomeModulo} • ${a.titulo}`} frase={a.frase} testid={`aba-planos-${a.id}`} />
          ))}
        </div>
      )}
      </div>
      <GradePlanos planos={daAba} onEscolher={onEscolher} quantidadeInicial={quantidadeInicial} />
    </>
  );
}

export default function PopupPlanos({ onFechar }: { onFechar: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aviso, setAviso] = useState("");
  const [escolhido, setEscolhido] = useState<PlanoPublico | null>(null);
  // Quantidade escolhida no cartão (números de WhatsApp ou pacotes de usuários — decisão #113)
  const [quantidade, setQuantidade] = useState(1);
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

  function escolher(p: PlanoPublico, qtd = 1) {
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
    setQuantidade(qtd);
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
          <Checkout plano={escolhido} quantidadeInicial={quantidade} onVoltar={() => setEscolhido(null)} />
        ) : (
          <PlanosComAbas planos={dados.planos} onEscolher={escolher} fixarAbas />
        )}
      </div>
      {chat && <ChatInteressado onFechar={() => setChat(false)} />}
    </div>
  );
}
