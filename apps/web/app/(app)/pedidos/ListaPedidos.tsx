"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatarReais } from "@/lib/planos";
import { useToast } from "@/components/app/Toast";
import { cancelarPedido, confirmarPagamento } from "./actions";

type Pedido = {
  id: string; codigo: string; renovacao: boolean; status: "AGUARDANDO" | "PAGO" | "CANCELADO" | "EXPIRADO";
  planoNome: string; modulo: "INDIVIDUAL" | "EMPRESARIAL"; usuarios: number | null; valor: number; forma: string;
  nome: string; email: string; whatsapp: string; empresaNome: string | null;
  criadoEm: string; expiraEm: string; confirmadoEm: string | null;
};

const ROTULO = { AGUARDANDO: "Aguardando", PAGO: "Pago", CANCELADO: "Cancelado", EXPIRADO: "Expirado" } as const;
const COR = {
  AGUARDANDO: { background: "#fff7e0", color: "#8a5a00" },
  PAGO: { background: "var(--primary-soft)", color: "#087a44" },
  CANCELADO: { background: "#ffeef0", color: "#9e1d2f" },
  EXPIRADO: { background: "#f1f3f2", color: "#5b6b62" },
} as const;
const FILTROS = ["AGUARDANDO", "PAGO", "EXPIRADO", "CANCELADO", "TODOS"] as const;

const data = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ListaPedidos({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  const toast = useToast();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("AGUARDANDO");
  const [pendente, iniciar] = useTransition();
  const lista = filtro === "TODOS" ? pedidos : pedidos.filter((p) => p.status === filtro);

  function agir(fn: () => Promise<{ ok: boolean; mensagem: string }>, pergunta: string) {
    if (!window.confirm(pergunta)) return;
    iniciar(async () => {
      const r = await fn();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      router.refresh();
    });
  }

  return (
    <div className="card p-3 mt-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const n = f === "TODOS" ? pedidos.length : pedidos.filter((p) => p.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className="px-2.5 py-1.5 rounded-full text-[11px] font-bold border"
              style={filtro === f ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : { borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {f === "TODOS" ? "Todos" : ROTULO[f]} ({n})
            </button>
          );
        })}
      </div>
      {lista.length === 0 ? (
        <p className="text-[12px] mt-3" style={{ color: "var(--muted)" }}>Nenhum pedido neste filtro.</p>
      ) : (
        <div className="table-wrap mt-2">
          <table style={{ minWidth: 980 }}>
            <thead>
              <tr><th>Pedido</th><th>Data</th><th>Plano</th><th>Valor</th><th>Comprador</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="font-bold font-mono">
                    {p.codigo}
                    {p.renovacao && <span className="chip block mt-0.5 font-sans" style={{ background: "#eef2ff", color: "#3730a3" }}>Renovação</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{data(p.criadoEm)}</td>
                  <td>
                    <b>{p.planoNome}</b>
                    <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                      {p.modulo === "EMPRESARIAL" ? `Business • ${p.usuarios ?? "—"} usuários` : "Individual"}
                    </span>
                  </td>
                  <td className="font-bold">{formatarReais(p.valor)}<span className="block text-[11px] font-semibold" style={{ color: "var(--muted)" }} data-testid="forma-pedido">{p.forma}</span></td>
                  <td>
                    <b>{p.nome}</b>
                    {p.empresaNome && <span className="block text-[11px]">{p.empresaNome}</span>}
                    <span className="block text-[11px]" style={{ color: "var(--muted)" }}>{p.email} • {p.whatsapp}</span>
                  </td>
                  <td>
                    <span className="chip" style={COR[p.status]}>{ROTULO[p.status]}</span>
                    {p.status === "AGUARDANDO" && <span className="block text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>vence {data(p.expiraEm)}</span>}
                    {p.confirmadoEm && <span className="block text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>em {data(p.confirmadoEm)}</span>}
                  </td>
                  <td>
                    {(p.status === "AGUARDANDO" || p.status === "EXPIRADO") && (
                      <div className="flex gap-1">
                        <button
                          className="btn-primary !py-1 !px-2 !text-[11px]"
                          disabled={pendente}
                          onClick={() => agir(() => confirmarPagamento(p.id), `Confirmar o pagamento de ${formatarReais(p.valor)} do pedido ${p.codigo}? A conta será criada e o acesso enviado para ${p.email}.`)}
                        >
                          Confirmar pagamento
                        </button>
                        <button
                          className="btn-ghost !py-1 !px-2 !text-[11px]"
                          disabled={pendente}
                          onClick={() => agir(() => cancelarPedido(p.id), `Cancelar o pedido ${p.codigo}?`)}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
