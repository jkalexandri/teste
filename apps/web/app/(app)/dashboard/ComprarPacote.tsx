"use client";

// Botão "Comprar mais disparos" (decisão #102): gera o PIX; o Super Admin confirma em Pedidos.
import { useState, useTransition } from "react";
import { useToast } from "@/components/app/Toast";
import { formatarReais } from "@/lib/planos";
import { mascaraDocumento } from "@/lib/documento";
import { comprarPacoteDisparos } from "./saldo-actions";

type Pix = { codigo: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string };

export default function ComprarPacote({ qtd, preco, precoTexto }: { qtd: number; preco: number; precoTexto: string }) {
  const toast = useToast();
  const [n, setN] = useState(1);
  const [pix, setPix] = useState<Pix | null>(null);
  const [pendente, iniciar] = useTransition();
  // CPF/CNPJ pedido pelo Asaas quando a conta ainda não tem guardado (decisão #115)
  const [pedirDoc, setPedirDoc] = useState(false);
  const [doc, setDoc] = useState("");
  if (pix) {
    return (
      <div className="flex gap-3 items-start w-full" data-testid="pix-disparos">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pix.qrCode} alt="QR Code do PIX" width={130} height={130} className="rounded-lg bg-white p-1.5" style={{ border: "1px solid var(--border)" }} />
        <div className="text-[12px] flex-1 min-w-0">
          <p>Valor: <b>{formatarReais(pix.valor)}</b> • Pedido <b>{pix.codigo}</b></p>
          <div className="flex gap-1.5 mt-1.5">
            <input readOnly value={pix.copiaECola} className="input !py-1 !text-[11px] font-mono" aria-label="PIX copia e cola" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-ghost shrink-0" onClick={() => navigator.clipboard.writeText(pix.copiaECola).then(() => toast("PIX copiado.", "ok"), () => undefined)}>Copiar</button>
          </div>
          <p className="help mt-1">Os disparos entram assim que o pagamento for confirmado.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {pedirDoc && <input className="input !py-1.5 !w-[180px] !text-[12px]" value={doc} onChange={(e) => setDoc(mascaraDocumento(e.target.value))} placeholder="CPF ou CNPJ de quem paga" aria-label="CPF ou CNPJ de quem paga" data-testid="doc-disparos" />}
      <select className="input !py-1.5 !w-auto !text-[12px]" value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Quantidade de pacotes">
        {[1, 2, 3, 5, 10].map((i) => <option key={i} value={i}>{(i * qtd).toLocaleString("pt-BR")} disparos — {formatarReais(i * preco)}</option>)}
      </select>
      <button type="button" className="btn-primary" disabled={pendente} data-testid="comprar-disparos" title={`Pacote de ${qtd} disparos por ${precoTexto}`}
        onClick={() => iniciar(async () => { const r = await comprarPacoteDisparos(n, doc); if (r.ok) setPix(r); else { if (r.mensagem.includes("CPF")) setPedirDoc(true); toast(r.mensagem, "erro"); } })}>
        {pendente ? "Gerando PIX…" : "Comprar mais disparos"}
      </button>
    </div>
  );
}
