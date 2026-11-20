"use client";

// Tela do PIX (QR Code + copia e cola). Usada na compra e na renovação.
import { useState } from "react";
import { Copy } from "@/components/icons";
import { formatarReais } from "@/lib/planos";

export type DadosPix = { codigo: string; plano: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string; renovacao?: boolean };

export default function TelaPix({ pix }: { pix: DadosPix }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
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

  return (
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
        {pix.renovacao
          ? "Assim que confirmarmos o pagamento, seu acesso será renovado e você receberá a confirmação por e-mail."
          : "Assim que confirmarmos o pagamento, você receberá por e-mail o acesso com uma senha temporária."}
      </div>
    </div>
  );
}
