"use client";

import { useState } from "react";
import { TriangleAlert } from "@/components/icons";
import { formatarReais, type PlanoPublico } from "@/lib/planos";
import { GradePlanos } from "@/components/planos/PopupPlanos";
import TelaPix, { type DadosPix } from "@/components/planos/TelaPix";

type Conta = {
  nome: string; pacote: string; planoId: string | null; expiraEm: string;
  /** WhatsApps extras atuais (Individual — decisões #80 e #95) */
  extras: number; numerosExtras: { id: string; rotulo: string }[];
};

export default function RenovarCliente({ token, conta, planos }: { token: string; conta: Conta; planos: PlanoPublico[] }) {
  const [pix, setPix] = useState<DadosPix | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Passo dos extras: plano escolhido, quantos manter e quais números
  const [escolhido, setEscolhido] = useState<PlanoPublico | null>(null);
  const [qtd, setQtd] = useState(0);
  const [manter, setManter] = useState<string[]>([]);
  const venc = new Date(conta.expiraEm);
  const vencido = venc < new Date();

  /** Máximo de extras na renovação: só pode manter ou diminuir, até o limite do plano escolhido. */
  const maxExtras = (p: PlanoPublico) => (p.precoWhatsappExtra != null ? Math.min(conta.extras, Math.max(0, (p.maxWhatsapps ?? 1) - 1)) : 0);

  function escolher(p: PlanoPublico) {
    if (conta.extras > 0) {
      const max = maxExtras(p);
      setEscolhido(p);
      setQtd(max);
      setManter(conta.numerosExtras.slice(0, max).map((n) => n.id));
      return;
    }
    void gerar(p, 0, []);
  }

  async function gerar(p: PlanoPublico, extras: number, manterIds: string[]) {
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/renovacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, planoId: p.id, extras, manter: manterIds }),
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
        {!pix && escolhido && (
          <div className="mt-3" data-testid="passo-extras">
            <p className="text-[13px] font-bold text-white">Plano {escolhido.nome}: WhatsApps extras</p>
            <label className="login-label mt-2" htmlFor="rn-extras">Quantos extras manter (você tem {conta.extras})</label>
            <select id="rn-extras" className="login-input sem-icone" value={qtd}
              onChange={(e) => { const n = Number(e.target.value); setQtd(n); setManter((m) => m.slice(0, n)); }}>
              {Array.from({ length: maxExtras(escolhido) + 1 }, (_, i) => (
                <option key={i} value={i} style={{ color: "#0b1220" }}>{i === 0 ? "Nenhum" : `${i} extra${i > 1 ? "s" : ""}`}</option>
              ))}
            </select>
            {qtd < conta.numerosExtras.length && qtd > 0 && (
              <div className="mt-2">
                <p className="text-[12px] text-slate-300">Escolha {qtd === 1 ? "o número" : `os ${qtd} números`} que ficam (os outros ficam desconectados até comprar de novo):</p>
                {conta.numerosExtras.map((n) => (
                  <label key={n.id} className="flex items-center gap-2 text-[13px] text-slate-200 mt-1 cursor-pointer">
                    <input type="checkbox" checked={manter.includes(n.id)} disabled={!manter.includes(n.id) && manter.length >= qtd}
                      onChange={(e) => setManter((m) => (e.target.checked ? [...m, n.id] : m.filter((x) => x !== n.id)))} />
                    {n.rotulo}
                  </label>
                ))}
              </div>
            )}
            {qtd < conta.extras && <p className="text-[11px] text-slate-400 mt-1">O número principal sempre continua.</p>}
            <p className="text-[13px] text-slate-200 mt-2">
              Total: <b className="text-white">{formatarReais((escolhido.precoAtual ?? 0) + qtd * (escolhido.precoWhatsappExtra ?? 0))}</b>/{escolhido.periodo}
            </p>
            <div className="flex gap-2 mt-3">
              <button type="button" className="login-ghost-btn !px-3" onClick={() => setEscolhido(null)}>Voltar</button>
              <button type="button" className="login-cta !py-2.5" disabled={enviando} onClick={() => void gerar(escolhido, qtd, manter)}>{enviando ? "Gerando…" : "Gerar PIX"}</button>
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
              <GradePlanos
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
