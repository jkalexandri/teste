"use client";

// Barra dos relatórios (etapa 11 — decisão #96): escolher a conta (com busca), filtros, Baixar Excel e Imprimir.
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LISTA_STATUS, STATUS_LEAD } from "@/lib/leads-status";

type Opcao = { id: string; rotulo: string };

export default function BarraRelatorio({ tipo, contas, rotuloConta, filtrosLeads, filtroPeriodo, usuarios, temResultado }: {
  tipo: string; contas: Opcao[]; rotuloConta: string; filtrosLeads: boolean; filtroPeriodo: boolean;
  usuarios?: { id: string; nome: string }[]; temResultado: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? contas.filter((c) => c.rotulo.toLowerCase().includes(t)) : contas;
  }, [busca, contas]);

  const ir = (mudar: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(mudar)) if (v) q.set(k, v); else q.delete(k);
    if (!("pagina" in mudar)) q.delete("pagina");
    router.push(`${pathname}?${q.toString()}`);
  };
  const consulta = () => { const q = new URLSearchParams(sp.toString()); q.delete("pagina"); return q.toString(); };

  return (
    <div className="card p-3 mt-3 flex flex-col gap-2 nao-imprimir">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[260px]">
          <label className="label" htmlFor="rel-conta">{rotuloConta}</label>
          <div className="flex gap-1.5">
            <input className="input !py-1.5 !w-[160px]" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conta" />
            <select id="rel-conta" className="input !py-1.5" value={sp.get("conta") ?? ""} onChange={(e) => ir({ conta: e.target.value, usuario: "" })}>
              {tipo !== "campanhas" && <option value="">Escolha…</option>}
              {visiveis.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
            </select>
          </div>
        </div>
        {temResultado && (
          <div className="flex gap-2">
            <a className="btn-ghost" href={`/api/relatorios/${tipo}?${consulta()}`} data-testid="baixar-excel">Baixar Excel</a>
            <a className="btn-primary" href={`${pathname}?${consulta()}&imprimir=1`} target="_blank" rel="noreferrer" data-testid="imprimir">Imprimir</a>
          </div>
        )}
      </div>
      {(filtrosLeads || filtroPeriodo) && (
        <div className="flex flex-wrap items-end gap-2">
          {filtrosLeads && usuarios && (
            <div>
              <label className="label" htmlFor="rel-usuario">Usuário</label>
              <select id="rel-usuario" className="input !py-1.5 !w-auto" value={sp.get("usuario") ?? ""} onChange={(e) => ir({ usuario: e.target.value })}>
                <option value="">Todos</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          )}
          {filtrosLeads && (
            <>
              <div>
                <label className="label" htmlFor="rel-status">Status</label>
                <select id="rel-status" className="input !py-1.5 !w-auto" value={sp.get("status") ?? ""} onChange={(e) => ir({ status: e.target.value })}>
                  <option value="">Todos</option>
                  {LISTA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LEAD[s].rotulo}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="rel-ativos">Situação</label>
                <select id="rel-ativos" className="input !py-1.5 !w-auto" value={sp.get("ativos") ?? ""} onChange={(e) => ir({ ativos: e.target.value })}>
                  <option value="">Todos</option>
                  <option value="ativos">Ativos</option>
                  <option value="inativos">Inativos</option>
                </select>
              </div>
            </>
          )}
          {filtroPeriodo && (
            <>
              <div>
                <label className="label" htmlFor="rel-de">De</label>
                <input id="rel-de" type="date" className="input !py-1.5 !w-auto" value={sp.get("de") ?? ""} onChange={(e) => ir({ de: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="rel-ate">Até</label>
                <input id="rel-ate" type="date" className="input !py-1.5 !w-auto" value={sp.get("ate") ?? ""} onChange={(e) => ir({ ate: e.target.value })} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Na página de impressão: abre a janela de imprimir sozinha. */
export function AutoImprimir() {
  useEffect(() => { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); }, []);
  return null;
}
