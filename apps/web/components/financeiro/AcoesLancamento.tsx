"use client";

// Ações de uma linha: pagar/receber (data, conta e comprovante), anexar comprovante, estornar e cancelar (decisão #106).
import { useState } from "react";
import FormFin from "./FormFin";
import BotaoFin from "./BotaoFin";
import { anexarComprovante, cancelarLancamento, estornar, marcarPago } from "@/app/(app)/financeiro/actions";

type L = { id: string; tipo: "RECEITA" | "DESPESA"; situacao: string; origem: string; valor: number; comprovante: boolean };

export default function AcoesLancamento({ l, contas, hoje }: { l: L; contas: { id: string; nome: string }[]; hoje: string }) {
  const [aberto, setAberto] = useState<"" | "pagar" | "anexo" | "estorno">("");
  const pendente = l.situacao === "PENDENTE";
  const podeEstornar = l.tipo === "RECEITA" && l.situacao === "PAGO" && l.valor > 0;
  const podeCancelar = l.situacao !== "CANCELADO" && l.origem !== "PEDIDO" && l.origem !== "ESTORNO";
  return (
    <div className="flex flex-col gap-1 items-start">
      <div className="flex flex-wrap gap-1">
        {pendente && <button type="button" className="btn-primary !py-1 !px-2 !text-[11px]" onClick={() => setAberto(aberto === "pagar" ? "" : "pagar")}>{l.tipo === "RECEITA" ? "Receber" : "Pagar"}</button>}
        {l.comprovante && <a className="btn-ghost !py-1 !px-2 !text-[11px]" href={`/api/financeiro/comprovante/${l.id}`} target="_blank" rel="noreferrer">Comprovante</a>}
        {!pendente && l.situacao !== "CANCELADO" && <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={() => setAberto(aberto === "anexo" ? "" : "anexo")}>{l.comprovante ? "Trocar" : "Anexar"}</button>}
        {podeEstornar && <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={() => setAberto(aberto === "estorno" ? "" : "estorno")}>Estornar</button>}
        {podeCancelar && <BotaoFin acao={cancelarLancamento} id={l.id} rotulo="Cancelar" perigo confirmar="Cancelar este lançamento? Ele deixa de contar nos totais." />}
      </div>
      {aberto === "pagar" && (
        <FormFin acao={marcarPago} className="flex flex-wrap gap-1 items-end" aoTerminar={() => setAberto("")}>
          <input type="hidden" name="id" value={l.id} />
          <label className="text-[10px]">Data<input name="pagoEm" type="date" defaultValue={hoje} className="input !py-1 !text-[11px] !w-[130px]" /></label>
          <label className="text-[10px]">Conta<select name="contaId" className="input !py-1 !text-[11px] !w-[120px]"><option value="">—</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label className="text-[10px]">Comprovante<input name="comprovante" type="file" accept="application/pdf,image/jpeg,image/png" className="input !py-0.5 !text-[10px] !w-[160px]" /></label>
          <button className="btn-primary !py-1 !text-[11px]">Confirmar</button>
        </FormFin>
      )}
      {aberto === "anexo" && (
        <FormFin acao={anexarComprovante} className="flex gap-1 items-end" aoTerminar={() => setAberto("")}>
          <input type="hidden" name="id" value={l.id} />
          <input name="comprovante" type="file" required accept="application/pdf,image/jpeg,image/png" className="input !py-0.5 !text-[10px] !w-[180px]" aria-label="Comprovante" />
          <button className="btn-primary !py-1 !text-[11px]">Enviar</button>
        </FormFin>
      )}
      {aberto === "estorno" && (
        <FormFin acao={estornar} className="flex flex-wrap gap-1 items-end" aoTerminar={() => setAberto("")} confirmar="Registrar o estorno? O valor será abatido do faturamento.">
          <input type="hidden" name="id" value={l.id} />
          <label className="text-[10px]">Valor (vazio = total)<input name="valor" className="input !py-1 !text-[11px] !w-[110px]" placeholder="0,00" /></label>
          <label className="text-[10px]">Motivo<input name="motivo" className="input !py-1 !text-[11px] !w-[160px]" maxLength={200} /></label>
          <button className="btn-primary !py-1 !text-[11px]">Estornar</button>
        </FormFin>
      )}
    </div>
  );
}
