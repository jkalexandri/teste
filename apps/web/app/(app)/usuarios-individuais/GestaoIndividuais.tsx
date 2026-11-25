"use client";

import { ABAS_PLANOS, type AbaPlanos } from "@/lib/planos";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { Plus, X } from "@/components/icons";
import { alternarLeadsAnuncios, definirExtras, definirLimiteLeads, desligarCobrancaAutomaticaSA, prorrogarEmpresa } from "../empresas/actions";
import CampoLimite from "@/components/app/CampoLimite";
import ControleTreinoIA, { type TreinoIA } from "@/components/app/ControleTreinoIA";
import { alternarBloqueio, criarIndividual, reenviarAcesso } from "./actions";

type Linha = {
  id: string; codigo: string; leads: number; limiteLeads: number | null; empresaId: string; nome: string; email: string; whatsapp: string; pacote: string;
  expiraEm: string; dias: number; automatica: boolean; ativo: boolean; primeiroAcesso: boolean; treino: TreinoIA; leadsAnuncios: boolean; whatsappsExtras: number;
};
type Plano = { id: string; nome: string; gratis: boolean; prazoDias: number; aba: AbaPlanos; disparos: number | null };

export default function GestaoIndividuais({ usuarios, planos }: { usuarios: Linha[]; planos: Plano[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  // Tipo do cadastro (decisão #113): Mensal (sem limite de disparos / Free por dias) ou Por disparo
  const [tipo, setTipo] = useState<AbaPlanos>("ilimitado");
  const doTipo = planos.filter((p) => p.aba === tipo);
  const [planoId, setPlanoId] = useState(doTipo.find((p) => !p.gratis)?.id ?? doTipo[0]?.id ?? "");
  const [busca, setBusca] = useState("");
  const [limitando, setLimitando] = useState<Linha | null>(null);
  const plano = planos.find((p) => p.id === planoId);
  const lista = usuarios.filter((u) => (u.codigo + u.nome + u.email + u.whatsapp).toLowerCase().includes(busca.toLowerCase()));

  function agir(fn: () => Promise<{ ok: boolean; mensagem: string }>) {
    iniciar(async () => {
      const r = await fn();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-3">
        {!criando ? (
          <button className="btn-primary" onClick={() => { setErro(""); setCriando(true); }}><Plus size={14} /> Novo usuário individual</button>
        ) : (
          <form
            className="card p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              iniciar(async () => {
                const r = await criarIndividual(fd);
                if (!r.ok) { setErro(r.mensagem); return; }
                toast(r.mensagem);
                setCriando(false);
                router.refresh();
              });
            }}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display font-bold text-[14px]">Novo usuário individual</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setCriando(false)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <div className="grid sm:grid-cols-3 gap-2.5 mt-2">
              <div><label className="label" htmlFor="ind-nome">Nome</label><input id="ind-nome" name="nome" className="input" /></div>
              <div><label className="label" htmlFor="ind-email">E-mail (login)</label><input id="ind-email" name="email" type="email" className="input" /></div>
              <div><label className="label" htmlFor="ind-whats">WhatsApp</label><input id="ind-whats" name="whatsapp" className="input" placeholder="(11) 90000-0000" /></div>
              <div>
                <label className="label" htmlFor="ind-tipo">Tipo</label>
                <select id="ind-tipo" className="input" value={tipo} onChange={(e) => {
                  const t = e.target.value as AbaPlanos;
                  const lista = planos.filter((p) => p.aba === t);
                  setTipo(t);
                  setPlanoId(lista.find((p) => !p.gratis)?.id ?? lista[0]?.id ?? "");
                }}>
                  {ABAS_PLANOS.map((a) => <option key={a.id} value={a.id}>{a.titulo} — {a.id === "ilimitado" ? "por dias, sem limite de disparos" : "por quantidade de disparos"}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ind-plano">Plano</label>
                <select id="ind-plano" name="planoId" className="input" value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
                  {doTipo.length === 0 && <option value="">Nenhum plano deste tipo</option>}
                  {doTipo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}{p.gratis ? ` (teste ${p.disparos ? `de ${p.disparos.toLocaleString("pt-BR")} disparos` : `de ${p.prazoDias} dias`})` : p.disparos ? ` (${p.disparos.toLocaleString("pt-BR")} disparos por período)` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ind-prazo">Prazo (dias)</label>
                <input id="ind-prazo" name="prazoDias" type="number" min={1} className="input" defaultValue={plano?.prazoDias ?? 31} key={planoId} />
              </div>
            </div>
            <p className="help mt-2">A pessoa recebe por e-mail uma senha temporária e troca no primeiro acesso.</p>
            {erro && <p className="text-[12px] font-semibold text-[#b42318] mt-2">{erro}</p>}
            <div className="flex gap-2 mt-3">
              <button className="btn-primary" disabled={pendente}>{pendente ? "Criando…" : "Criar e enviar acesso"}</button>
              <button type="button" className="btn-ghost" onClick={() => setCriando(false)}>Cancelar</button>
            </div>
          </form>
        )}
      </div>

      <div className="card p-3 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold text-[14px]">Usuários individuais ({usuarios.length})</h2>
          <input className="input !w-full sm:!w-[260px] sm:ml-auto !py-1.5" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp" />
        </div>
        {lista.length === 0 ? (
          <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum usuário individual encontrado.</p>
        ) : (
          <div className="table-wrap mt-2">
            <table style={{ minWidth: 1100 }}>
              <thead><tr><th>Código</th><th>Usuário</th><th>Leads</th><th>Plano</th><th>Expira em</th><th>Dias restantes</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{u.codigo}</td>
                    <td>
                      <b>{u.nome}</b>
                      <span className="block text-[11px]" style={{ color: "var(--muted)" }}>{u.email}{u.whatsapp && ` • ${u.whatsapp}`}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{u.leads.toLocaleString("pt-BR")} / {u.limiteLeads == null ? "ilimitado" : u.limiteLeads.toLocaleString("pt-BR")}</td>
                    <td>{u.pacote}</td>
                    <td>{u.expiraEm ? new Date(u.expiraEm).toLocaleDateString("pt-BR") : "—"}</td>
                    <td>
                      <span className="chip" style={u.dias < 0 ? { background: "#ffeef0", color: "#9e1d2f" } : u.dias <= 10 ? { background: "#fff7e0", color: "#8a5a00" } : { background: "var(--surface-3)", color: "var(--muted)" }}>
                        {u.dias < 0 ? "Expirado" : u.dias === 0 ? "Expira hoje" : `${u.dias} ${u.dias === 1 ? "dia" : "dias"}`}
                      </span>
                      {u.automatica && <span className="block text-[11px] mt-0.5 font-bold" style={{ color: "var(--primary-dark)" }} data-testid="cobranca-automatica-ligada">Cobrança automática: ligada</span>}
                    </td>
                    <td>
                      <span className="chip" style={u.ativo ? { background: "var(--primary-soft)", color: "#087a44" } : { background: "#ffeef0", color: "#9e1d2f" }}>
                        {u.ativo ? "Ativo" : "Bloqueado"}
                      </span>
                      {u.primeiroAcesso && <span className="block text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>aguardando 1º acesso</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => agir(() => prorrogarEmpresa(u.empresaId))}>Prorrogar</button>
                        {u.automatica && (
                          <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} data-testid="desligar-automatica"
                            onClick={() => window.confirm(`Desligar a cobrança automática no cartão de ${u.nome}? O acesso continua até ${new Date(u.expiraEm).toLocaleDateString("pt-BR")}; depois, a renovação volta a ser pelo link.`) && agir(() => desligarCobrancaAutomaticaSA(u.empresaId))}>
                            Desligar cobrança automática
                          </button>
                        )}
                        <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => setLimitando(u)}>Limite de leads</button>
                        <ControleTreinoIA empresaId={u.empresaId} nome={u.nome} t={u.treino} />
                        <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} data-testid="anuncios-conta"
                          onClick={() => window.confirm(`${u.leadsAnuncios ? "Desligar" : "Ligar"} leads de anúncios para ${u.nome}?`) && agir(() => alternarLeadsAnuncios(u.empresaId))}>
                          Anúncios: {u.leadsAnuncios ? "ligado" : "desligado"}
                        </button>
                        <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} data-testid="extras-conta"
                          onClick={() => {
                            const v = window.prompt(`WhatsApps extras de ${u.nome} (além do principal, de 0 a 9). Ao diminuir, saem os mais recentes.`, String(u.whatsappsExtras));
                            if (v != null) agir(() => definirExtras(u.empresaId, Number(v)));
                          }}>
                          WhatsApps: {1 + u.whatsappsExtras}
                        </button>
                        <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => window.confirm(`${u.ativo ? "Bloquear" : "Desbloquear"} ${u.nome}?`) && agir(() => alternarBloqueio(u.id))}>
                          {u.ativo ? "Bloquear" : "Desbloquear"}
                        </button>
                        <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => window.confirm(`Enviar nova senha temporária para ${u.email}?`) && agir(() => reenviarAcesso(u.id))}>
                          Reenviar acesso
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Limite de leads da conta individual (decisão #58) */}
      {limitando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Limite de leads">
          <form
            className="card w-full max-w-[400px] p-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fd = new FormData(ev.currentTarget);
              iniciar(async () => {
                const r = await definirLimiteLeads(limitando.empresaId, fd);
                toast(r.mensagem, r.ok ? "ok" : "erro");
                if (r.ok) setLimitando(null);
                router.refresh();
              });
            }}
          >
            <h2 className="font-display font-extrabold text-[16px]">Limite de leads • {limitando.nome}</h2>
            <div className="mt-3"><CampoLimite valor={limitando.limiteLeads} id="ind-limite" /></div>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn-ghost" onClick={() => setLimitando(null)}>Cancelar</button>
              <button className="btn-primary" disabled={pendente}>Salvar limite</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
