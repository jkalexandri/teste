"use client";

// Lista de leads com busca, filtros, paginação e ações por linha (decisões #56, #57 e #59).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { Pencil, X } from "@/components/icons";
import { LISTA_STATUS, STATUS_LEAD, fimBloqueioSair, type StatusLeadId } from "@/lib/leads-status";
import { alternarAtivoLead, editarLead, excluirLead, mudarStatusLead } from "./actions";

export type LinhaTabela = {
  id: string; codigo: string; nome: string; telefone: string; telefoneFmt: string;
  status: StatusLeadId; ativo: boolean; pediuSairEm: string | null;
  qualificacao: string | null; qualificacaoMotivo: string | null; qualificacaoEm: string | null;
  usuario: string; conta: string;
};
type Opcao = { id: string; rotulo: string; grupo?: string };
type Pode = { editarNome: boolean; editarTelefone: boolean; inativar: boolean; mudarStatus: boolean; excluir: boolean };

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function ChipStatus({ status }: { status: StatusLeadId }) {
  const s = STATUS_LEAD[status];
  return <span className="chip" style={{ background: s.fundo, color: s.cor }}>{s.rotulo}</span>;
}

export default function ListaLeads({ linhas, total, totalGeral, pagina, porPagina, filtros, perfil, pode, usuarios, contas }: {
  linhas: LinhaTabela[]; total: number; totalGeral: number; pagina: number; porPagina: number;
  filtros: { q: string; usuario: string; conta: string; status: string; situacao: string };
  perfil: "SUPERADMIN" | "ADMIN_EMPRESA" | "USUARIO"; pode: Pode; usuarios: Opcao[]; contas: Opcao[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState<LinhaTabela | null>(null);
  const [erro, setErro] = useState("");
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const mostraDono = perfil !== "USUARIO";

  function agir(fn: () => Promise<{ ok: boolean; mensagem: string }>) {
    iniciar(async () => {
      const r = await fn();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      router.refresh();
    });
  }

  const irPara = (p: number) => {
    const sp = new URLSearchParams(Object.entries({ ...filtros, pagina: String(p) }).filter(([, v]) => v));
    router.push(`/leads?${sp.toString()}`);
  };

  return (
    <div className="card p-3 flex flex-col min-w-0">
      {/* Busca e filtros (no servidor, pela URL) */}
      <form className="flex flex-wrap gap-2 items-center" action="/leads">
        <h2 className="font-display font-bold text-[14px] mr-auto">Lista de leads</h2>
        <input name="q" defaultValue={filtros.q} className="input !w-full sm:!w-[220px] !py-1.5" placeholder="Buscar nome, telefone ou código" aria-label="Buscar lead" />
        {perfil === "SUPERADMIN" && (
          <select name="conta" defaultValue={filtros.conta} className="input !w-auto !py-1.5" aria-label="Filtrar por conta">
            <option value="">Todas as contas</option>
            <option value="meus">Meus leads (Super Admin)</option>
            {["Empresas", "Usuários individuais"].map((g) => (
              <optgroup key={g} label={g}>
                {contas.filter((c) => c.grupo === g).map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        {mostraDono && usuarios.length > 0 && (
          <select name="usuario" defaultValue={filtros.usuario} className="input !w-auto !py-1.5" aria-label="Filtrar por usuário">
            <option value="">Todos os usuários</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.rotulo}</option>)}
          </select>
        )}
        <select name="status" defaultValue={filtros.status} className="input !w-auto !py-1.5" aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {LISTA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LEAD[s].rotulo}</option>)}
        </select>
        <select name="situacao" defaultValue={filtros.situacao} className="input !w-auto !py-1.5" aria-label="Ativos ou inativos">
          <option value="">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Ativos e inativos</option>
        </select>
        <button className="btn-ghost !py-1.5">Filtrar</button>
      </form>

      {linhas.length === 0 ? (
        <p className="text-[12px] mt-3" style={{ color: "var(--muted)" }}>
          {totalGeral === 0 ? "Nenhum lead ainda. Adicione ao lado." : "Nenhum lead encontrado para os filtros escolhidos."}
        </p>
      ) : (
        <div className="table-wrap mt-2">
          <table style={{ minWidth: mostraDono ? 1080 : 860, fontSize: 12 }}>
            <thead>
              <tr>
                <th>Código</th><th>Lead</th><th>Telefone</th>
                {mostraDono && <th>Usuário</th>}
                {perfil === "SUPERADMIN" && <th>Conta</th>}
                <th>Status</th><th>Qualificação da IA</th><th>Motivo • Data</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} style={{ opacity: l.ativo ? 1 : 0.55 }} data-codigo={l.codigo}>
                  <td style={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>{l.codigo}</td>
                  <td className="font-bold" style={{ whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={l.nome}>
                    {l.nome || <span style={{ color: "var(--muted)", fontWeight: 400 }}>(sem nome)</span>}
                    {!l.ativo && <span className="chip ml-1" style={{ background: "#f1f3f2", color: "#5b6b62" }}>Inativo</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{l.telefoneFmt}</td>
                  {mostraDono && <td style={{ whiteSpace: "nowrap" }}>{l.usuario}</td>}
                  {perfil === "SUPERADMIN" && <td style={{ whiteSpace: "nowrap" }}>{l.conta}</td>}
                  <td style={{ whiteSpace: "nowrap" }}>
                    <ChipStatus status={l.status} />
                    {l.status === "PEDIU_SAIR" && l.pediuSairEm && (
                      <span className="block text-[10px] mt-0.5" style={{ color: "#9e1d2f" }}>
                        Em {data(l.pediuSairEm)} • bloqueado até {data(fimBloqueioSair(new Date(l.pediuSairEm)).toISOString())}
                      </span>
                    )}
                  </td>
                  <td>{l.qualificacao ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>
                    <span className="text-[12px] [overflow-wrap:anywhere]">{l.qualificacaoMotivo || "—"}</span>
                    <span className="block text-[11px]" style={{ color: "var(--muted)" }}>{l.qualificacaoEm ? data(l.qualificacaoEm) : "—"}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1 items-center">
                      <select
                        className="input !w-auto !py-1 !px-1.5 !text-[11px]"
                        value={l.status}
                        disabled={pendente || !pode.mudarStatus}
                        aria-label={`Status do lead ${l.codigo}`}
                        onChange={(ev) => agir(() => mudarStatusLead(l.id, ev.target.value))}
                      >
                        {LISTA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LEAD[s].rotulo}</option>)}
                      </select>
                      <button className="btn-ghost !py-1 !px-1.5 !text-[11px]" onClick={() => { setErro(""); setEditando(l); }}><Pencil size={11} /> Editar</button>
                      <button className="btn-ghost !py-1 !px-1.5 !text-[11px]" disabled={pendente} onClick={() => agir(() => alternarAtivoLead(l.id))}>
                        {l.ativo ? "Inativar" : "Reativar"}
                      </button>
                      {pode.excluir && (
                        <button
                          className="btn-ghost !py-1 !px-1.5 !text-[11px]"
                          style={{ color: "#b42318" }}
                          disabled={pendente}
                          onClick={() => window.confirm(`Excluir definitivamente o lead ${l.codigo}?`) && agir(() => excluirLead(l.id))}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <p className="help">Mostrando {linhas.length} de {total.toLocaleString("pt-BR")} leads{total !== totalGeral ? ` (filtrados de ${totalGeral.toLocaleString("pt-BR")})` : ""}.</p>
        {paginas > 1 && (
          <div className="flex items-center gap-1.5">
            <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pagina <= 1} onClick={() => irPara(pagina - 1)}>Anterior</button>
            <span className="text-[11px] font-bold">Página {pagina} de {paginas}</span>
            <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pagina >= paginas} onClick={() => irPara(pagina + 1)}>Próxima</button>
          </div>
        )}
      </div>

      {/* Editar lead */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Editar lead">
          <form
            className="card w-full max-w-[420px] p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              iniciar(async () => {
                const r = await editarLead(editando.id, fd);
                if (!r.ok) { setErro(r.mensagem); return; }
                toast(r.mensagem);
                setEditando(null);
                router.refresh();
              });
            }}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display font-extrabold text-[16px]">Editar lead {editando.codigo}</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setEditando(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <label className="label mt-3" htmlFor="ed-nome">Nome</label>
            <input id="ed-nome" name="nome" className="input" defaultValue={editando.nome} placeholder="Nome do lead (pode ficar em branco)" />
            <label className="label mt-2" htmlFor="ed-tel">Telefone</label>
            {pode.editarTelefone ? (
              <input id="ed-tel" name="telefone" className="input" defaultValue={editando.telefoneFmt} />
            ) : (
              <>
                <input id="ed-tel" className="input" value={editando.telefoneFmt} disabled readOnly />
                <p className="help mt-0.5">Só o administrador da empresa altera o telefone.</p>
              </>
            )}
            {erro && <p className="text-[12px] font-semibold text-[#b42318] mt-2">{erro}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
