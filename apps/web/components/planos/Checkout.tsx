"use client";

// Compra pelo popup "Planos": dados do comprador → PIX (planos pagos) ou
// conta criada na hora (Free). Decisões #32, #33, #34, #39.
import { useState } from "react";
import { ChevronRight, CircleCheck, TriangleAlert } from "@/components/icons";
import TelaPix, { type DadosPix } from "./TelaPix";
import EscolhaPagamento, { textoBotaoPagar, useFormas, type Pagamento } from "./EscolhaPagamento";
import { formatarReais, maxQuantidade, precoComQuantidade, rotuloQuantidade, type PlanoPublico } from "@/lib/planos";

type Pix = DadosPix;

function mascaraFone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Checkout({ plano, onVoltar, quantidadeInicial = 1 }: { plano: PlanoPublico; onVoltar: () => void; quantidadeInicial?: number }) {
  const empresarial = plano.modulo === "EMPRESARIAL";
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [empresaNome, setEmpresaNome] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [freeOk, setFreeOk] = useState(false);
  // Quantidade (decisão #113): números de WhatsApp (Individual) ou pacotes de usuários (Empresarial); vem do cartão e pode trocar aqui
  const maxQ = maxQuantidade(plano);
  const [quantidade, setQuantidade] = useState(Math.min(Math.max(1, quantidadeInicial), maxQ));
  // Forma de pagamento pelo Asaas (decisão #115): PIX, cartão ou boleto; sem Asaas, PIX manual
  const formas = useFormas();
  const [pagamento, setPagamento] = useState<Pagamento>({ forma: "PIX", parcelas: 1, cpfCnpj: "", automatica: true });
  const valorBase = plano.precoAtual != null ? precoComQuantidade(plano.precoAtual, plano.descontos, quantidade) : 0;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const url = plano.gratis ? "/api/teste-gratis" : "/api/pedidos";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planoId: plano.id, nome, email, whatsapp, empresaNome, quantidade, ...(formas?.asaas ? pagamento : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) {
      setErro(d.erro || "Não foi possível concluir. Tente novamente.");
      return;
    }
    if (plano.gratis) setFreeOk(true);
    else setPix(d);
  }

  const resumo = plano.gratis
    ? `Teste grátis • ${plano.testeDias ?? 7} dias ou ${plano.testeDisparos ?? 20} disparos`
    : `${plano.precoAtual != null ? formatarReais(precoComQuantidade(plano.precoAtual, plano.descontos, quantidade)) : ""}/${plano.periodo} • ${rotuloQuantidade(plano, quantidade)}`;

  return (
    <div className="login-glass rounded-[24px] p-5 w-full max-w-[480px] mx-auto text-[#eaf6ff]">
      <button onClick={onVoltar} className="flex items-center gap-1 text-[13px] font-bold text-slate-300">
        <ChevronRight className="rotate-180" size={15} /> Voltar aos planos
      </button>
      <h3 className="font-display text-[22px] font-extrabold mt-2 text-white">Plano {plano.nome}</h3>
      <p className="text-[13px] text-slate-400">{resumo}</p>

      {freeOk ? (
        <div className="mt-4 rounded-xl p-3" style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.30)" }}>
          <div className="flex gap-2 font-bold text-[13px] text-emerald-300"><CircleCheck size={16} /> Conta de teste criada</div>
          <p className="text-[13px] mt-1.5 leading-relaxed text-slate-300">
            Enviamos para <b className="[overflow-wrap:anywhere]">{email}</b> um link para criar a sua senha. Depois, na tela de login,
            escolha “Módulo Individual”.
          </p>
        </div>
      ) : pix ? (
        <TelaPix pix={pix} />
      ) : (
        <form onSubmit={enviar} className="mt-4 space-y-2.5">
          <div>
            <label className="login-label" htmlFor="ck-nome">Seu nome</label>
            <input id="ck-nome" className="login-input sem-icone" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
          {empresarial && (
            <div>
              <label className="login-label" htmlFor="ck-empresa">Nome da empresa</label>
              <input id="ck-empresa" className="login-input sem-icone" value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} autoComplete="organization" />
            </div>
          )}
          <div>
            <label className="login-label" htmlFor="ck-email">E-mail (será o seu login)</label>
            <input id="ck-email" type="email" className="login-input sem-icone" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="login-label" htmlFor="ck-whats">WhatsApp</label>
            <input id="ck-whats" className="login-input sem-icone" value={whatsapp} onChange={(e) => setWhatsapp(mascaraFone(e.target.value))} placeholder="(11) 90000-0000" inputMode="tel" />
          </div>
          {maxQ > 1 && (
            <div>
              <label className="login-label" htmlFor="ck-quantidade">{plano.modulo === "INDIVIDUAL" ? "Números de WhatsApp" : "Usuários"}</label>
              <select id="ck-quantidade" className="login-input sem-icone" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))}>
                {Array.from({ length: maxQ }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{rotuloQuantidade(plano, n)} — {formatarReais(precoComQuantidade(plano.precoAtual ?? 0, plano.descontos, n))}/{plano.periodo}</option>
                ))}
              </select>
              {/* Com o Asaas, o total aparece junto da forma de pagamento (não repete aqui) */}
              {!formas?.asaas && <p className="text-[12px] text-slate-300 mt-1" data-testid="total-extras">
                Total: <b className="text-white">{formatarReais(precoComQuantidade(plano.precoAtual ?? 0, plano.descontos, quantidade))}</b>/{plano.periodo}
              </p>}
            </div>
          )}
          {!plano.gratis && formas && (
            <EscolhaPagamento formas={formas} valor={valorBase} prazoDias={plano.prazoDias ?? 31} periodo={plano.periodo}
              valorPagamento={pagamento} onChange={setPagamento} />
          )}
          {empresarial && <p className="text-[11px] text-slate-400">Quem compra um plano de empresa se torna o Administrador da empresa. Já é cliente? Use o seu e-mail de acesso para renovar.</p>}
          {!empresarial && !plano.gratis && <p className="text-[11px] text-slate-400">Já é cliente? Use o seu e-mail de acesso para renovar.</p>}
          {erro && (
            <div className="flex gap-2 text-[12px] font-semibold text-rose-200 bg-rose-500/15 border border-rose-400/30 rounded-xl p-2">
              <TriangleAlert size={15} className="shrink-0" /> {erro}
            </div>
          )}
          <button className="login-cta !py-3" type="submit" disabled={enviando || (!plano.gratis && !formas)}>
            {enviando ? "Enviando…" : plano.gratis ? "Criar minha conta de teste" : textoBotaoPagar(pagamento, !!formas?.asaas)}
          </button>
          {/* Decisão #88: aceite dos Termos e da Política ao comprar */}
          <p className="text-[11px] text-slate-400 text-center leading-snug" data-testid="aceite-termos">
            Ao continuar, você concorda com os{" "}
            <a href="/termos" target="_blank" rel="noreferrer" className="underline text-slate-300">Termos de Uso</a> e a{" "}
            <a href="/privacidade" target="_blank" rel="noreferrer" className="underline text-slate-300">Política de Privacidade</a>.
          </p>
        </form>
      )}
    </div>
  );
}
