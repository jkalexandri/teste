"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { Building2, Plus, X } from "@/components/icons";
import { alterarPacote, alternarEmpresaAtiva, alternarLeadsAnuncios, criarEmpresa, definirLimiteLeads, desligarCobrancaAutomaticaSA, prorrogarEmpresa } from "./actions";
import CampoLimite from "@/components/app/CampoLimite";
import ControleTreinoIA, { type TreinoIA } from "@/components/app/ControleTreinoIA";

export type EmpresaLinha = {
  id: string; codigo: string; nome: string; pacote: string; planoId: string | null; limite: number; ativa: boolean; pacotes: number; automatica: boolean;
  expiraEm: string; dias: number; usados: number; leads: number; limiteLeads: number | null; treino: TreinoIA; leadsAnuncios: boolean;
  usuarios: { id: string; codigo: string; nome: string; email: string; admin: boolean; ativo: boolean }[];
};
type PlanoOpcao = { id: string; nome: string; usuarios: number | null; personalizado: boolean; prazoDias: number; maxPacotes: number };

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function textoDias(d: number) {
  if (d < 0) return "Pacote expirado";
  if (d === 0) return "Expira hoje";
  return `${d} ${d === 1 ? "dia restante" : "dias restantes"}`;
}

export default function GestaoEmpresas({ empresas, planos, podeEditar }: { empresas: EmpresaLinha[]; planos: PlanoOpcao[]; podeEditar: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [abertas, setAbertas] = useState<string[]>([]);
  const [planoNovo, setPlanoNovo] = useState(planos.find((p) => !p.personalizado)?.id ?? "");
  const [trocando, setTrocando] = useState<string | null>(null);
  const [planoTroca, setPlanoTroca] = useState("");
  const [limitando, setLimitando] = useState<string | null>(null);

  const planoSel = planos.find((p) => p.id === planoNovo);
  const planoTrocaSel = planos.find((p) => p.id === planoTroca);

  function agir(fn: () => Promise<{ ok: boolean; mensagem: string }>, depois?: () => void) {
    iniciar(async () => {
      const r = await fn();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) depois?.();
      router.refresh();
    });
  }

  return (
    <>
      {podeEditar && (
        <div className="mt-3">
          {!criando ? (
            <button className="btn-primary" onClick={() => { setErro(""); setCriando(true); }}>
              <Plus size={14} /> Criar empresa
            </button>
          ) : (
            <form
              className="card p-3 sm:p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                iniciar(async () => {
                  const r = await criarEmpresa(fd);
                  if (!r.ok) { setErro(r.mensagem); return; }
                  toast(r.mensagem);
                  setCriando(false);
                  router.refresh();
                });
              }}
            >
              <div className="flex items-start justify-between">
                <h2 className="font-display font-bold text-[14px]">Criar empresa</h2>
                <button type="button" className="btn-ghost !p-1.5" onClick={() => setCriando(false)} aria-label="Fechar"><X size={14} /></button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2.5 mt-2">
                <Campo nome="nomeEmpresa" rotulo="Nome da empresa" />
                <div>
                  <label className="label" htmlFor="planoId">Pacote</label>
                  <select id="planoId" name="planoId" className="input" value={planoNovo} onChange={(e) => setPlanoNovo(e.target.value)}>
                    {planos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}{p.usuarios ? ` — ${p.usuarios} usuários` : " — quantidade definida por você"}</option>
                    ))}
                  </select>
                </div>
                {planoSel?.personalizado ? (
                  <Campo nome="limite" rotulo="Quantidade de usuários" tipo="number" />
                ) : (
                  <Campo nome="prazoDias" rotulo="Prazo (dias)" tipo="number" padrao={String(planoSel?.prazoDias ?? 31)} />
                )}
                {planoSel?.personalizado && <Campo nome="prazoDias" rotulo="Prazo (dias)" tipo="number" padrao={String(planoSel.prazoDias)} />}
                <Campo nome="adminNome" rotulo="Nome do Admin da Empresa" />
                <Campo nome="adminEmail" rotulo="E-mail do Admin (login)" tipo="email" />
                <Campo nome="adminWhatsapp" rotulo="WhatsApp do Admin (opcional)" />
              </div>
              <p className="help mt-2">O Admin recebe por e-mail uma senha temporária e troca no primeiro acesso. Ele não conta no limite de usuários.</p>
              {erro && <p className="text-[12px] font-semibold text-[#b42318] mt-2">{erro}</p>}
              <div className="flex gap-2 mt-3">
                <button className="btn-primary" disabled={pendente}>{pendente ? "Criando…" : "Criar empresa e enviar acesso"}</button>
                <button type="button" className="btn-ghost" onClick={() => setCriando(false)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}

      {empresas.length === 0 ? (
        <div className="card p-3 mt-3"><p className="text-[12px]">Nenhuma empresa cadastrada ainda.</p></div>
      ) : (
        <div className="grid gap-3 mt-3">
          {empresas.map((e) => {
            const aberta = abertas.includes(e.id) || !podeEditar;
            return (
              <article key={e.id} className="card p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="flex gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: "var(--primary)" }}>
                      <Building2 size={17} />
                    </div>
                    <div className="min-w-0">
                      <b className="text-[14px] [overflow-wrap:anywhere]"><span style={{ fontFamily: "monospace", color: "var(--muted)" }}>{e.codigo}</span> • {e.nome}</b>
                      <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                        Pacote <b style={{ color: "var(--text)" }}>{e.pacote}</b> • {e.ativa ? "Ativa" : "Inativa"} • Expira em{" "}
                        <b style={{ color: "var(--text)" }}>{data(e.expiraEm)}</b> ({textoDias(e.dias)}, iguais para todos da empresa)
                      </p>
                    </div>
                  </div>
                  <span className="chip self-start" style={e.usados >= e.limite ? { background: "#fff7e0", color: "#8a5a00" } : { background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
                    Usuários: {e.usados} / {e.limite}{e.usados >= e.limite ? " • limite atingido" : ""}
                  </span>
                  <span className="chip self-start" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                    Leads: {e.leads.toLocaleString("pt-BR")} / {e.limiteLeads == null ? "ilimitado" : e.limiteLeads.toLocaleString("pt-BR")}
                  </span>
                  {e.automatica && (
                    <span className="chip self-start" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }} data-testid="cobranca-automatica-ligada">
                      Cobrança automática: ligada
                    </span>
                  )}
                </div>

                {podeEditar && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button className="btn-ghost !py-1.5" onClick={() => setAbertas((a) => (a.includes(e.id) ? a.filter((x) => x !== e.id) : [...a, e.id]))}>
                      {aberta ? "Recolher" : "Ver usuários"}
                    </button>
                    <button className="btn-ghost !py-1.5" disabled={pendente} onClick={() => { setTrocando(e.id); setPlanoTroca(e.planoId ?? planos[0]?.id ?? ""); }}>
                      Alterar pacote
                    </button>
                    <button className="btn-ghost !py-1.5" disabled={pendente} onClick={() => setLimitando(limitando === e.id ? null : e.id)}>Limite de leads</button>
                    <ControleTreinoIA empresaId={e.id} nome={e.nome} t={e.treino} />
                    <button className="btn-ghost !py-1.5" disabled={pendente} data-testid="anuncios-conta"
                      onClick={() => window.confirm(`${e.leadsAnuncios ? "Desligar" : "Ligar"} leads de anúncios para ${e.nome}?`) && agir(() => alternarLeadsAnuncios(e.id))}>
                      Anúncios: {e.leadsAnuncios ? "ligado" : "desligado"}
                    </button>
                    <button className="btn-ghost !py-1.5" disabled={pendente} onClick={() => agir(() => prorrogarEmpresa(e.id))}>Prorrogar</button>
                    {e.automatica && (
                      <button className="btn-ghost !py-1.5" disabled={pendente} data-testid="desligar-automatica"
                        onClick={() => window.confirm(`Desligar a cobrança automática no cartão de ${e.nome}? O acesso continua até ${data(e.expiraEm)}; depois, a renovação volta a ser pelo link.`) && agir(() => desligarCobrancaAutomaticaSA(e.id))}>
                        Desligar cobrança automática
                      </button>
                    )}
                    <button
                      className="btn-ghost !py-1.5"
                      disabled={pendente}
                      onClick={() => window.confirm(`${e.ativa ? "Inativar" : "Ativar"} ${e.nome}?${e.ativa ? " Os usuários não poderão entrar." : ""}`) && agir(() => alternarEmpresaAtiva(e.id))}
                    >
                      {e.ativa ? "Inativar empresa" : "Ativar empresa"}
                    </button>
                  </div>
                )}

                {trocando === e.id && (
                  <form
                    className="rounded-lg p-2.5 mt-2 flex flex-wrap items-end gap-2"
                    style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const fd = new FormData(ev.currentTarget);
                      agir(() => alterarPacote(e.id, fd), () => setTrocando(null));
                    }}
                  >
                    <div>
                      <label className="label" htmlFor={`troca-${e.id}`}>Novo pacote</label>
                      <select id={`troca-${e.id}`} name="planoId" className="input !w-auto" value={planoTroca} onChange={(ev) => setPlanoTroca(ev.target.value)}>
                        {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.usuarios ? ` — ${p.usuarios} usuários` : ""}</option>)}
                      </select>
                    </div>
                    {/* Quantidade de pacotes de usuários (decisão #113): usuários, disparos e leads acompanham */}
                    {planoTrocaSel && !planoTrocaSel.personalizado && planoTrocaSel.maxPacotes > 1 && (
                      <div>
                        <label className="label" htmlFor={`pac-${e.id}`}>Usuários</label>
                        <select key={planoTrocaSel.id} id={`pac-${e.id}`} name="pacotes" className="input !w-auto" defaultValue={String(Math.min(e.pacotes, planoTrocaSel.maxPacotes))}>
                          {Array.from({ length: planoTrocaSel.maxPacotes }, (_, i) => i + 1).map((q) => (
                            <option key={q} value={q}>{(planoTrocaSel.usuarios ?? 1) * q} usuários{q > 1 ? ` (${q} pacotes)` : ""}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {planoTrocaSel?.personalizado && (
                      <div>
                        <label className="label" htmlFor={`lim-${e.id}`}>Usuários</label>
                        <input id={`lim-${e.id}`} name="limite" type="number" min={1} className="input !w-[110px]" defaultValue={e.limite} />
                      </div>
                    )}
                    <button className="btn-primary" disabled={pendente}>Salvar pacote</button>
                    <button type="button" className="btn-ghost" onClick={() => setTrocando(null)}>Cancelar</button>
                    <p className="help w-full">Ao diminuir, os usuários atuais continuam; novos só dentro do limite. Disparos e leads do período acompanham a quantidade de pacotes.</p>
                  </form>
                )}

                {limitando === e.id && (
                  <form
                    className="rounded-lg p-2.5 mt-2 flex flex-wrap items-end gap-2"
                    style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      const fd = new FormData(ev.currentTarget);
                      agir(() => definirLimiteLeads(e.id, fd), () => setLimitando(null));
                    }}
                  >
                    <div className="min-w-[260px]"><CampoLimite valor={e.limiteLeads} rotulo="Limite de leads da empresa (todos os usuários)" id={`ll-${e.id}`} /></div>
                    <button className="btn-primary" disabled={pendente}>Salvar limite</button>
                    <button type="button" className="btn-ghost" onClick={() => setLimitando(null)}>Cancelar</button>
                    <p className="help w-full">O Admin da Empresa pode definir, dentro disto, um limite para cada usuário.</p>
                  </form>
                )}

                {aberta && (
                  <div className="rounded-lg p-2.5 mt-2" style={{ background: "var(--surface-3)" }}>
                    <b className="text-[12px]">Pessoas da empresa ({e.usuarios.length})</b>
                    {e.usuarios.length === 0 ? (
                      <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Nenhum usuário ainda.</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {e.usuarios.map((u) => (
                          <li key={u.id} className="text-[12px] [overflow-wrap:anywhere]">
                            <span style={{ fontFamily: "monospace" }}>{u.codigo}</span> • {u.nome} • {u.email} • {u.admin ? "Admin da Empresa (não conta no limite)" : "Usuário"}{!u.ativo && " • bloqueado"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function Campo({ nome, rotulo, tipo = "text", padrao }: { nome: string; rotulo: string; tipo?: string; padrao?: string }) {
  return (
    <div>
      <label className="label" htmlFor={nome}>{rotulo}</label>
      <input id={nome} name={nome} type={tipo} min={tipo === "number" ? 1 : undefined} className="input" defaultValue={padrao} key={padrao} />
    </div>
  );
}
