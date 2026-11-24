"use client";

// Tela do pagamento: PIX (QR Code + copia e cola), cartão (página do Asaas) ou boleto (link + linha digitável).
// Usada na compra, na renovação, no WhatsApp extra e nos pacotes de disparos (decisões #33 e #115).
import { useState } from "react";
import { Copy } from "@/components/icons";
import { formatarReais } from "@/lib/planos";

export type DadosPix = {
  codigo: string; plano: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string; renovacao?: boolean;
  /** Asaas (decisão #115): forma, parcelas, página de pagamento e linha digitável do boleto */
  forma?: "PIX_MANUAL" | "PIX" | "BOLETO" | "CARTAO"; parcelas?: number; link?: string | null; boletoLinha?: string | null;
};

export default function TelaPix({ pix }: { pix: DadosPix }) {
  const [copiado, setCopiado] = useState(false);
  const forma = pix.forma ?? "PIX_MANUAL";

  async function copiar(texto = pix.copiaECola) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  const aviso = (
    <div className="mt-3 rounded-xl p-3 text-[13px] leading-relaxed text-slate-300" style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.30)" }}>
      {pix.renovacao
        ? "Assim que confirmarmos o pagamento, seu acesso será renovado e você receberá a confirmação por e-mail."
        : "Assim que confirmarmos o pagamento, você receberá por e-mail o acesso com uma senha temporária."}
    </div>
  );
  const resumo = (
    <div className="text-[13px] leading-relaxed">
      <p>Valor: <b className="text-white text-[16px]">{formatarReais(pix.valor)}</b>{pix.parcelas && pix.parcelas > 1 ? <span className="text-slate-400"> em {pix.parcelas}x</span> : null}</p>
      <p className="text-slate-400">Pedido <b className="text-slate-200">{pix.codigo}</b></p>
    </div>
  );

  // Cartão: o cliente paga na página segura do Asaas (decisão #115)
  if (forma === "CARTAO") {
    return (
      <div className="mt-4" data-testid="pagar-cartao">
        {resumo}
        <a href={pix.link ?? "#"} target="_blank" rel="noreferrer" className="login-cta !py-3 mt-3 flex justify-center" data-testid="link-cartao">
          Abrir a página de pagamento com cartão
        </a>
        <p className="text-[11.5px] text-slate-400 mt-2">A página do Asaas abre em outra aba. O FilaPro não vê nem guarda os dados do cartão.</p>
        {aviso}
      </div>
    );
  }
  // Boleto: link para abrir/imprimir e a linha digitável para copiar
  if (forma === "BOLETO") {
    return (
      <div className="mt-4" data-testid="pagar-boleto">
        {resumo}
        <a href={pix.link ?? "#"} target="_blank" rel="noreferrer" className="login-cta !py-3 mt-3 flex justify-center" data-testid="link-boleto">Abrir o boleto</a>
        {pix.boletoLinha && (
          <>
            <label className="login-label mt-3" htmlFor="boleto-linha">Linha digitável</label>
            <div className="flex gap-1.5">
              <input id="boleto-linha" readOnly value={pix.boletoLinha} className="login-input sem-icone font-mono" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" onClick={() => copiar(pix.boletoLinha!)} className="login-ghost-btn !px-3 shrink-0">
                <Copy size={14} /> {copiado ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </>
        )}
        <p className="text-[11.5px] text-slate-400 mt-2">O boleto vence em 3 dias e compensa em 1 a 3 dias úteis depois de pago.</p>
        {aviso}
      </div>
    );
  }

  return (
    <div className="mt-4" data-testid="pagar-pix">
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
        <button type="button" onClick={() => copiar()} className="login-ghost-btn !px-3 shrink-0">
          <Copy size={14} /> {copiado ? "Copiado!" : "Copiar"}
        </button>
      </div>
      {aviso}
    </div>
  );
}
