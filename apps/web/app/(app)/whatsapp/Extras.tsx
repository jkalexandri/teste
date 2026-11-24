"use client";

// Tela WhatsApp (etapa 10c): apelido de cada número e "Adicionar mais um WhatsApp" (PIX proporcional).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { formatarReais } from "@/lib/planos";
import { mascaraDocumento } from "@/lib/documento";
import { alterarNumerosSuperAdmin, comprarExtra, salvarApelido } from "./actions";

export function Apelido({ sessaoId, inicial, saude }: { sessaoId: string; inicial: string; saude?: { rotulo: string; nivel: string; enviados7d: number } }) {
  const toast = useToast();
  const router = useRouter();
  const [valor, setValor] = useState(inicial);
  const [pendente, iniciar] = useTransition();
  return (
    <form className="flex flex-wrap items-center gap-2 mt-1.5" onSubmit={(e) => { e.preventDefault(); iniciar(async () => { const r = await salvarApelido(sessaoId, valor); toast(r.mensagem, r.ok ? "ok" : "erro"); router.refresh(); }); }}>
      <input className="input !py-1 !w-[220px] !text-[12px]" value={valor} onChange={(e) => setValor(e.target.value)} maxLength={40} placeholder="Apelido (ex.: Vendas 2)" aria-label="Apelido do número" />
      <button className="btn-ghost !py-1 !text-[12px]" disabled={pendente || valor === inicial}>Salvar apelido</button>
      {saude && <span className="text-[11px]" data-testid="saude-numero" style={{ color: "var(--muted)" }}>Saúde deste número: <b>{saude.rotulo}</b> ({saude.enviados7d} envios em 7 dias)</span>}
    </form>
  );
}

type Info = { podeComprar: boolean; maximo: number; total: number; precoPeriodo: number; valorAgora: number; vence: string };
type Pix = { codigo: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string };

export function ComprarExtra({ info }: { info: Info }) {
  const toast = useToast();
  const [pix, setPix] = useState<Pix | null>(null);
  const [pendente, iniciar] = useTransition();
  // CPF/CNPJ pedido pelo Asaas quando a conta ainda não tem guardado (decisão #115)
  const [pedirDoc, setPedirDoc] = useState(false);
  const [doc, setDoc] = useState("");
  return (
    <div className="card p-4 mt-3" data-testid="comprar-extra">
      <h2 className="font-display font-extrabold text-[16px]">Mais números</h2>
      <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
        Você usa {info.total} de {info.maximo} WhatsApps do seu plano. Cada extra custa {formatarReais(info.precoPeriodo)} por período e vence junto com o plano
        ({new Date(info.vence).toLocaleDateString("pt-BR")}).
      </p>
      {pix ? (
        <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start" data-testid="pix-extra">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pix.qrCode} alt="QR Code do PIX" width={170} height={170} className="rounded-xl bg-white p-2" style={{ border: "1px solid var(--border)" }} />
          <div className="text-[13px] leading-relaxed flex-1 min-w-0">
            <p>Valor: <b className="text-[16px]">{formatarReais(pix.valor)}</b> • Pedido <b>{pix.codigo}</b></p>
            <p className="help">Válido até {new Date(pix.expiraEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
            <div className="flex gap-1.5 mt-2">
              <input readOnly value={pix.copiaECola} className="input !text-[11px] font-mono" aria-label="PIX copia e cola" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn-ghost shrink-0" onClick={() => navigator.clipboard.writeText(pix.copiaECola).then(() => toast("PIX copiado.", "ok"), () => undefined)}>Copiar</button>
            </div>
            <p className="help mt-2">Assim que o pagamento for confirmado, o novo número aparece nesta tela para você ler o QR Code.</p>
          </div>
        </div>
      ) : info.podeComprar ? (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {pedirDoc && <input className="input !w-[200px]" value={doc} onChange={(ev) => setDoc(mascaraDocumento(ev.target.value))} placeholder="CPF ou CNPJ de quem paga" aria-label="CPF ou CNPJ de quem paga" data-testid="doc-extra" />}
          <button type="button" className="btn-primary" disabled={pendente}
            onClick={() => iniciar(async () => { const r = await comprarExtra(doc); if (r.ok) setPix(r); else { if (r.mensagem.includes("CPF")) setPedirDoc(true); toast(r.mensagem, "erro"); } })}>
            {pendente ? "Gerando PIX…" : "Adicionar mais um WhatsApp"}
          </button>
          <span className="text-[12px]">Valor agora: <b>{formatarReais(info.valorAgora)}</b> (proporcional aos dias que faltam)</span>
        </div>
      ) : (
        <p className="text-[12px] mt-2 font-bold">Você já usa o máximo de números do seu plano.</p>
      )}
    </div>
  );
}

/** Super Admin: adicionar/remover números próprios, sem pagamento (decisão #113). */
export function NumerosSuperAdmin({ total, maximo }: { total: number; maximo: number }) {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const alterar = (d: 1 | -1) => iniciar(async () => { const r = await alterarNumerosSuperAdmin(d); toast(r.mensagem, r.ok ? "ok" : "erro"); router.refresh(); });
  return (
    <div className="card p-4 mt-3" data-testid="numeros-superadmin">
      <h2 className="font-display font-extrabold text-[16px]">Mais números</h2>
      <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
        Você usa {total} de {maximo} WhatsApps, sem custo. Nas campanhas você escolhe por quais números enviar.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-primary" disabled={pendente || total >= maximo} onClick={() => alterar(1)} data-testid="sa-adicionar-numero">Adicionar mais um WhatsApp</button>
        {total > 1 && <button className="btn-ghost" disabled={pendente} onClick={() => { if (confirm("Remover o último número? Ele será desconectado; as conversas ficam guardadas.")) alterar(-1); }} data-testid="sa-remover-numero">Remover o último número</button>}
      </div>
    </div>
  );
}
