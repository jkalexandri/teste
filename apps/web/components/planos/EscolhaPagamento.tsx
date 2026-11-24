"use client";

// Escolha da forma de pagamento (decisão #115): PIX, cartão (à vista ou parcelado) ou boleto (+2%), pelo Asaas.
// Usada na compra (popup Planos) e na renovação. Com o Asaas desligado não aparece (o pedido sai no PIX manual).
import { useEffect, useState } from "react";
import { mascaraDocumento } from "@/lib/documento";
import { ACRESCIMO_BOLETO, formatarReais, MAX_PARCELAS, parcelamento, podeParcelar, valorDaForma, type FormaPagamento } from "@/lib/planos";

export type Formas = { asaas: boolean; jurosMes: number | null };
export type Pagamento = { forma: FormaPagamento; parcelas: number; cpfCnpj: string };

/** Lê as formas ligadas (uma vez por tela). */
export function useFormas() {
  const [formas, setFormas] = useState<Formas | null>(null);
  useEffect(() => {
    fetch("/api/pagamento/formas").then((r) => r.json()).then(setFormas).catch(() => setFormas({ asaas: false, jurosMes: null }));
  }, []);
  return formas;
}

/** Texto do botão final conforme a forma. */
export const textoBotaoPagar = (p: Pagamento, asaas: boolean) =>
  !asaas || p.forma === "PIX" ? "Gerar PIX" : p.forma === "BOLETO" ? "Gerar boleto" : "Pagar com cartão";

export default function EscolhaPagamento({ formas, valor, prazoDias, periodo, valorPagamento, onChange, documentoGuardado }: {
  formas: Formas;
  /** Valor do plano já com a quantidade, em centavos */
  valor: number;
  prazoDias: number;
  periodo: string;
  valorPagamento: Pagamento;
  onChange: (p: Pagamento) => void;
  /** Conta que já tem CPF/CNPJ guardado (renovação): mostra só o final e permite deixar em branco */
  documentoGuardado?: string | null;
}) {
  if (!formas.asaas) return null;
  const { forma, parcelas, cpfCnpj } = valorPagamento;
  const mudar = (p: Partial<Pagamento>) => onChange({ ...valorPagamento, ...p });
  const parcelavel = podeParcelar({ prazoDias }) && formas.jurosMes != null;
  const total = valorDaForma(valor, forma, parcelas, formas.jurosMes);
  const opcoes: { id: FormaPagamento; titulo: string; detalhe: string }[] = [
    { id: "PIX", titulo: "PIX", detalhe: "Aprovação na hora" },
    { id: "CARTAO", titulo: "Cartão", detalhe: parcelavel ? `À vista ou até ${MAX_PARCELAS}x` : "À vista" },
    { id: "BOLETO", titulo: "Boleto", detalhe: `+${ACRESCIMO_BOLETO}% • 1 a 3 dias úteis` },
  ];

  return (
    <div className="space-y-2.5" data-testid="escolha-pagamento">
      <div>
        <label className="login-label" htmlFor="ck-documento">CPF ou CNPJ de quem paga</label>
        <input id="ck-documento" className="login-input sem-icone" value={cpfCnpj} inputMode="numeric"
          onChange={(e) => mudar({ cpfCnpj: mascaraDocumento(e.target.value) })}
          placeholder={documentoGuardado ? `Já cadastrado (${documentoGuardado}) — deixe vazio para usar` : "000.000.000-00"} />
      </div>
      <div>
        <p className="login-label">Forma de pagamento</p>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Forma de pagamento">
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={forma === o.id} data-testid={`forma-${o.id}`}
              onClick={() => mudar({ forma: o.id, parcelas: 1 })}
              className="rounded-xl px-2 py-2 text-left"
              style={forma === o.id
                ? { background: "rgba(37,211,102,.16)", border: "1px solid rgba(37,211,102,.6)", color: "#eaf6ff" }
                : { background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#cfe8dc" }}>
              <span className="block text-[13px] font-extrabold">{o.titulo}</span>
              <span className="block text-[10.5px] text-slate-400 leading-tight">{o.detalhe}</span>
            </button>
          ))}
        </div>
      </div>
      {forma === "CARTAO" && parcelavel && (
        <div>
          <label className="login-label" htmlFor="ck-parcelas">Parcelas</label>
          <select id="ck-parcelas" className="login-input sem-icone" value={parcelas} onChange={(e) => mudar({ parcelas: Number(e.target.value) })}>
            {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => {
              const p = parcelamento(valor, n, formas.jurosMes ?? 0);
              return (
                <option key={n} value={n}>
                  {n === 1 ? `À vista — ${formatarReais(valor)}` : `${n}x de ${formatarReais(p.parcela)} — total ${formatarReais(p.total)}${formas.jurosMes ? " (com juros)" : " (sem juros)"}`}
                </option>
              );
            })}
          </select>
        </div>
      )}
      <p className="text-[12px] text-slate-300" data-testid="total-forma">
        Total: <b className="text-white">{formatarReais(total)}</b>/{periodo}
        {forma === "BOLETO" && <span className="text-slate-400"> (inclui {ACRESCIMO_BOLETO}% do boleto)</span>}
        {forma === "CARTAO" && parcelas > 1 && <span className="text-slate-400"> em {parcelas}x de {formatarReais(parcelamento(valor, parcelas, formas.jurosMes ?? 0).parcela)}</span>}
      </p>
      {forma === "CARTAO" && <p className="text-[11px] text-slate-400">Você vai digitar o cartão na página segura do Asaas. O FilaPro não vê nem guarda os dados do cartão.</p>}
    </div>
  );
}
