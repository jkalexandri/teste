"use client";

// Compra pelo popup "Planos": dados do comprador → PIX (planos pagos) ou
// conta criada na hora (Free). Decisões #32, #33, #34, #39.
import { useState } from "react";
import { ChevronRight, CircleCheck, Copy, TriangleAlert } from "@/components/icons";
import { formatarReais, type PlanoPublico } from "@/lib/planos";

type Pix = { codigo: string; plano: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string };

function mascaraFone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Checkout({ plano, onVoltar }: { plano: PlanoPublico; onVoltar: () => void }) {
  const empresarial = plano.modulo === "EMPRESARIAL";
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [empresaNome, setEmpresaNome] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [freeOk, setFreeOk] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const url = plano.gratis ? "/api/teste-gratis" : "/api/pedidos";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planoId: plano.id, nome, email, whatsapp, empresaNome }),
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

  async function copiar() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.copiaECola);
    } catch {
      const t = document.createElement("textarea");
      t.value = pix.copiaECola;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  const resumo = plano.gratis
    ? `Teste grátis • ${plano.testeDias ?? 7} dias ou ${plano.testeDisparos ?? 20} disparos`
    : `${plano.precoAtual != null ? formatarReais(plano.precoAtual) : ""}/${plano.periodo}${plano.usuarios ? ` • ${plano.usuarios} ${plano.usuarios === 1 ? "usuário" : "usuários"}` : ""}`;

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
            Enviamos para <b className="[overflow-wrap:anywhere]">{email}</b> o acesso com uma senha temporária. Na tela de login,
            escolha “Módulo Individual”.
          </p>
        </div>
      ) : pix ? (
        <div className="mt-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <img src={pix.qrCode} alt="QR Code do PIX" width={180} height={180} className="rounded-xl bg-white p-2 shrink-0" />
            <div className="text-[13px] leading-relaxed">
              <p>Valor: <b className="text-white text-[16px]">{formatarReais(pix.valor)}</b></p>
              <p className="text-slate-400">Pedido <b className="text-slate-200">{pix.codigo}</b></p>
              <p className="text-slate-400">
                Válido até {new Date(pix.expiraEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <label className="login-label mt-3" htmlFor="pix-cc">PIX copia e cola</label>
          <div className="flex gap-1.5">
            <input id="pix-cc" readOnly value={pix.copiaECola} className="login-input sem-icone font-mono" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copiar} className="login-ghost-btn !px-3 shrink-0">
              <Copy size={14} /> {copiado ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <div className="mt-3 rounded-xl p-3 text-[13px] leading-relaxed text-slate-300" style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.30)" }}>
            Assim que confirmarmos o pagamento, você receberá por e-mail o acesso com uma senha temporária.
          </div>
        </div>
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
          {empresarial && <p className="text-[11px] text-slate-400">Quem compra um plano de empresa se torna o Administrador da empresa.</p>}
          {erro && (
            <div className="flex gap-2 text-[12px] font-semibold text-rose-200 bg-rose-500/15 border border-rose-400/30 rounded-xl p-2">
              <TriangleAlert size={15} className="shrink-0" /> {erro}
            </div>
          )}
          <button className="login-cta !py-3" type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : plano.gratis ? "Criar minha conta de teste" : "Gerar PIX"}
          </button>
        </form>
      )}
    </div>
  );
}
