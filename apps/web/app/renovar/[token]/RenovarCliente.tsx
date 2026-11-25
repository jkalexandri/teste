"use client";

import { useState } from "react";
import { TriangleAlert } from "@/components/icons";
import { formatarReais, precoComQuantidade, rotuloQuantidade, type PlanoPublico } from "@/lib/planos";
import { PlanosComAbas } from "@/components/planos/PopupPlanos";
import TelaPix, { type DadosPix } from "@/components/planos/TelaPix";
import EscolhaPagamento, { textoBotaoPagar, useFormas, type Pagamento } from "@/components/planos/EscolhaPagamento";

type Conta = {
  nome: string; pacote: string; planoId: string | null; expiraEm: string;
  /** WhatsApps extras atuais (Individual — decisões #80 e #95) */
  extras: number; numerosExtras: { id: string; rotulo: string }[];
  /** Módulo e pacotes de usuários atuais (decisão #113) */
  modulo: "INDIVIDUAL" | "EMPRESARIAL"; pacotes: number;
  /** Final do CPF/CNPJ já guardado na conta (decisão #115) */
  documentoFinal?: string | null;
};

export default function RenovarCliente({ token, conta, planos }: { token: string; conta: Conta; planos: PlanoPublico[] }) {
  const [pix, setPix] = useState<DadosPix | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Passo dos extras: plano escolhido, quantos manter e quais números
  const [escolhido, setEscolhido] = useState<PlanoPublico | null>(null);
  const [qtd, setQtd] = useState(0);
  const [manter, setManter] = useState<string[]>([]);
  // Forma de pagamento pelo Asaas (decisão #115): passo depois de escolher o plano (e os extras)
  const formas = useFormas();
  const [passoForma, setPassoForma] = useState(false);
  const [pagamento, setPagamento] = useState<Pagamento>({ forma: "PIX", parcelas: 1, cpfCnpj: "", automatica: true });
  const venc = new Date(conta.expiraEm);
  const vencido = venc < new Date();

  // Quantidade atual da conta: números de WhatsApp (Individual) ou pacotes de usuários (Empresarial) — decisão #113
  const quantidadeAtual = conta.modulo === "INDIVIDUAL" ? 1 + conta.extras : Math.max(1, conta.pacotes);

  /** Escolheu plano e quantidade no cartão. Individual diminuindo números: escolhe quais extras ficam. */
  function escolher(p: PlanoPublico, quantidade = 1) {
    const extras = conta.modulo === "INDIVIDUAL" ? quantidade - 1 : 0;
    const manterIds = conta.numerosExtras.slice(0, Math.max(0, extras)).map((n) => n.id);
    if (conta.modulo === "INDIVIDUAL" && extras > 0 && extras < conta.numerosExtras.length) {
      setEscolhido(p);
      setQtd(quantidade);
      setManter(manterIds);
      return;
    }
    // Com o Asaas ligado, escolhe a forma de pagamento antes de gerar
    if (formas?.asaas) {
      setEscolhido(p);
      setQtd(quantidade);
      setManter(manterIds);
      setPassoForma(true);
      return;
    }
    void gerar(p, quantidade, manterIds);
  }

  async function gerar(p: PlanoPublico, quantidade: number, manterIds: string[]) {
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/renovacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, planoId: p.id, quantidade, manter: manterIds, ...(formas?.asaas ? pagamento : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) {
      setErro(d.erro || "Não foi possível gerar o PIX. Tente novamente.");
      return;
    }
    setPix(d);
  }

  return (
    <>
      <div className="login-glass rounded-[18px] p-4 max-w-[640px] mx-auto text-[#eaf6ff]">
        <h1 className="font-display text-[22px] font-extrabold text-white">Renovar acesso</h1>
        <p className="text-[13px] text-slate-300 mt-1">
          Conta <b className="text-white">{conta.nome}</b> • plano atual <b className="text-white">{conta.pacote}</b> •{" "}
          {vencido ? "venceu em " : "vence em "}
          <b className="text-white">{venc.toLocaleDateString("pt-BR")}</b>
        </p>
        <p className="text-[12px] text-slate-400 mt-1">
          Escolha o plano para renovar. Você pode manter o atual ou trocar. Usuários, leads e histórico continuam.
        </p>
        {erro && (
          <div className="flex gap-2 text-[12px] font-semibold text-rose-200 bg-rose-500/15 border border-rose-400/30 rounded-xl p-2 mt-3">
            <TriangleAlert size={15} className="shrink-0" /> {erro}
          </div>
        )}
        {pix && <TelaPix pix={pix} />}
        {!pix && escolhido && passoForma && formas && (
          <div className="mt-3 space-y-2.5" data-testid="passo-forma">
            <p className="text-[13px] font-bold text-white">Plano {escolhido.nome}: {rotuloQuantidade(escolhido, qtd)}</p>
            <EscolhaPagamento formas={formas} valor={precoComQuantidade(escolhido.precoAtual ?? 0, escolhido.descontos, qtd)}
              prazoDias={escolhido.prazoDias} periodo={escolhido.periodo} valorPagamento={pagamento} onChange={setPagamento}
              documentoGuardado={conta.documentoFinal} />
            <div className="flex gap-2">
              <button type="button" className="login-ghost-btn !px-3" onClick={() => { setPassoForma(false); setEscolhido(null); }}>Voltar</button>
              <button type="button" className="login-cta !py-2.5" disabled={enviando} onClick={() => void gerar(escolhido, qtd, manter)}>{enviando ? "Gerando…" : textoBotaoPagar(pagamento, true)}</button>
            </div>
          </div>
        )}
        {!pix && escolhido && !passoForma && (
          <div className="mt-3" data-testid="passo-extras">
            <p className="text-[13px] font-bold text-white">Plano {escolhido.nome}: {rotuloQuantidade(escolhido, qtd)}</p>
            <p className="text-[12px] text-slate-300 mt-1">Você tem {conta.extras} {conta.extras === 1 ? "número extra" : "números extras"}. Escolha {qtd - 1 === 1 ? "o que fica" : `os ${qtd - 1} que ficam`} (os outros ficam desconectados até comprar de novo):</p>
            {conta.numerosExtras.map((n) => (
              <label key={n.id} className="flex items-center gap-2 text-[13px] text-slate-200 mt-1 cursor-pointer">
                <input type="checkbox" checked={manter.includes(n.id)} disabled={!manter.includes(n.id) && manter.length >= qtd - 1}
                  onChange={(e) => setManter((m) => (e.target.checked ? [...m, n.id] : m.filter((x) => x !== n.id)))} />
                {n.rotulo}
              </label>
            ))}
            <p className="text-[11px] text-slate-400 mt-1">O número principal sempre continua.</p>
            <p className="text-[13px] text-slate-200 mt-2">
              Total: <b className="text-white">{formatarReais(precoComQuantidade(escolhido.precoAtual ?? 0, escolhido.descontos, qtd))}</b>/{escolhido.periodo}
            </p>
            <div className="flex gap-2 mt-3">
              <button type="button" className="login-ghost-btn !px-3" onClick={() => setEscolhido(null)}>Voltar</button>
              <button type="button" className="login-cta !py-2.5" disabled={enviando || manter.length !== qtd - 1} onClick={() => (formas?.asaas ? setPassoForma(true) : void gerar(escolhido, qtd, manter))}>{enviando ? "Gerando…" : formas?.asaas ? "Continuar" : "Gerar PIX"}</button>
            </div>
          </div>
        )}
      </div>
      {!pix && !escolhido && (
        <div className="mt-4">
          {planos.length === 0 ? (
            <div className="login-glass rounded-[18px] p-5 max-w-[640px] mx-auto text-[13px] text-slate-300">Nenhum plano disponível no momento.</div>
          ) : (
            <div style={{ opacity: enviando ? 0.6 : 1, pointerEvents: enviando ? "none" : undefined }}>
              <PlanosComAbas
                quantidadeInicial={quantidadeAtual}
                planos={planos.map((p) => ({ ...p, selo: p.id === conta.planoId ? "Seu plano atual" : p.selo, textoBotao: "Renovar com este plano" }))}
                onEscolher={escolher}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
