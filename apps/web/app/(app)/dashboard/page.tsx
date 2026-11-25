// Dashboard por perfil (estrutura da prévia, prompt seção 11).
// Só números reais do banco: leads (etapa 7), campanhas e disparos (etapa 8c).
// A qualificação da IA chega na etapa 10 (até lá, zero).
// Regras: sem linha TOTAL no fim do resumo por usuário; sem "— só a sua empresa";
// no Admin da Empresa, "Disparos por usuários" lista só os usuários (sem o Administrador).
import SaldoDisparos from "./SaldoDisparos";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { diasRestantes } from "@/lib/auth/acesso";
import Cabecalho from "@/components/app/Cabecalho";
import { Clock3, Layers, Play, Send, ShieldCheck, Sparkles, TriangleAlert } from "@/components/icons";
import Link from "next/link";
import { formatarTelefone } from "@/lib/telefone";
import { STATUS_LEAD } from "@/lib/leads-status";
import { COR_SAUDE, metricasPorUsuario, saudeDoNumero, somar, VAZIO } from "@/lib/metricas";

export const dynamic = "force-dynamic";

function diasAte(d: Date) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(d);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86400000);
}

function CardKpi({ icone, cor, valor, titulo, sub, selo }: {
  icone: ReactNode; cor: string; valor: number | string; titulo: string; sub?: string; selo?: ReactNode;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--primary-soft)", color: cor }}>
          {icone}
        </div>
        {selo}
      </div>
      <div className="font-display text-[24px] font-extrabold mt-2 leading-none">{valor}</div>
      <div className="font-bold text-[12px] mt-1">{titulo}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

const seloTotal = (
  <span className="chip" style={{ background: "#0b2f1f", color: "#fff", fontSize: "9px", padding: "3px 6px" }}>Total</span>
);

const KPIS = [
  { titulo: "Fila de envios", cor: "#2563eb", icone: <Clock3 size={18} /> },
  { titulo: "Enviados hoje", cor: "var(--primary)", icone: <Send size={18} /> },
  { titulo: "Bloqueados 24h", cor: "#e5484d", icone: <ShieldCheck size={18} /> },
  { titulo: "Leads qualificados pela IA", cor: "#f59e0b", icone: <Sparkles size={18} /> },
];

export default async function DashboardPage() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  const u = sessao.usuario;

  // ================= SUPER ADMIN =================
  if (u.cargo === Cargo.SUPERADMIN) {
    const empresas = await prisma.empresa.findMany({
      where: { modulo: Modulo.EMPRESARIAL },
      include: { usuarios: { where: { cargo: Cargo.USUARIO }, select: { id: true } }, _count: { select: { leads: true } } }, // Admin não conta (decisão #23)
      orderBy: { nome: "asc" },
    });
    const individuais = await prisma.usuario.findMany({
      where: { cargo: Cargo.USUARIO, empresa: { modulo: Modulo.INDIVIDUAL } },
      include: { empresa: { include: { _count: { select: { leads: true } } } } },
      orderBy: { nome: "asc" },
    });
    const totalLeads = await prisma.lead.count();
    // Métricas de todos que enviam (usuários das empresas, individuais e o próprio Super Admin)
    const m = await metricasPorUsuario([...empresas.flatMap((e) => e.usuarios.map((x) => x.id)), ...individuais.map((x) => x.id), u.id]);
    const geral = somar([...m.values()]);
    const daEmpresa = (e: (typeof empresas)[number]) => somar(e.usuarios.map((x) => m.get(x.id) ?? VAZIO));
    const cards = [
      { l: "Empresas", v: empresas.length },
      { l: "Usuários Individuais", v: individuais.length },
      { l: "Leads (total)", v: totalLeads.toLocaleString("pt-BR") },
      { l: "Campanhas (total)", v: geral.campanhas },
      { l: "Enviados (total)", v: geral.enviados },
      { l: "Em fila (total)", v: geral.fila },
      { l: "Bloqueados 24h (total)", v: geral.bloqueados24h },
      { l: "Qualificados pela IA (total)", v: geral.qualificados },
    ];
    return (
      <section className="flex-1 flex flex-col">
        <Cabecalho
          rotulo="Super Admin • Dashboard"
          titulo="Visão geral"
          descricao="Total de todas as empresas + todos os usuários individuais, agrupados abaixo. Nunca misturado."
        />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
          {cards.map((c) => (
            <div key={c.l} className="card p-3">
              <div className="font-display text-[24px] font-extrabold leading-none">{c.v}</div>
              <div className="font-bold text-[12px] mt-1">{c.l}</div>
              <span className="chip mt-1" style={{ background: "#0b2f1f", color: "#fff", fontSize: "9px" }}>Total</span>
            </div>
          ))}
        </div>

        <h2 className="font-display font-bold text-[14px] mt-4">Grupo “Empresas”</h2>
        {empresas.length === 0 ? (
          <div className="card p-3 mt-2"><p className="text-[12px]">Nenhuma empresa cadastrada ainda.</p></div>
        ) : (
          <div className="card p-3 mt-2">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Empresa</th><th>Usuários</th><th>Dias restantes</th><th>Leads</th><th>Campanhas</th><th>Enviados</th><th>Fila</th></tr>
                </thead>
                <tbody>
                  {empresas.map((e) => (
                    <tr key={e.id}>
                      <td className="font-bold">{e.nome}</td>
                      <td>{e.usuarios.length} / {e.limiteUsuarios}</td>
                      <td>{diasAte(e.expiraEm)}</td>
                      <td>{e._count.leads.toLocaleString("pt-BR")}</td><td>{daEmpresa(e).campanhas}</td><td>{daEmpresa(e).enviados}</td><td>{daEmpresa(e).fila}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <h2 className="font-display font-bold text-[14px] mt-4">Grupo “Usuários Individuais”</h2>
        {individuais.length === 0 ? (
          <div className="card p-3 mt-2"><p className="text-[12px]">Nenhum usuário individual cadastrado ainda.</p></div>
        ) : (
          <div className="card p-3 mt-2">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Usuário individual</th><th>Dias restantes</th><th>Leads</th><th>Campanhas</th><th>Enviados</th><th>Fila</th></tr>
                </thead>
                <tbody>
                  {individuais.map((i) => (
                    <tr key={i.id}>
                      <td className="font-bold">
                        {i.nome}
                        <span className="block text-[11px] font-normal" style={{ color: "var(--muted)" }}>{i.email}</span>
                      </td>
                      <td>{i.empresa ? diasAte(i.empresa.expiraEm) : "—"}</td>
                      <td>{(i.empresa?._count.leads ?? 0).toLocaleString("pt-BR")}</td><td>{(m.get(i.id) ?? VAZIO).campanhas}</td><td>{(m.get(i.id) ?? VAZIO).enviados}</td><td>{(m.get(i.id) ?? VAZIO).fila}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    );
  }

  // ================= ADMIN DA EMPRESA =================
  if (u.cargo === Cargo.ADMIN_EMPRESA) {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: u.empresaId, cargo: Cargo.USUARIO }, // sem o Administrador
      orderBy: { nome: "asc" },
    });
    const m = await metricasPorUsuario(usuarios.map((x) => x.id));
    const t = somar(usuarios.map((x) => m.get(x.id) ?? VAZIO));
    const valores = [t.fila, t.enviadosHoje, t.bloqueados24h, t.qualificados];
    const subs = [
      "Total de leads na fila • só os usuários da sua empresa",
      "Soma só dos usuários da sua empresa",
      "Soma só dos usuários da sua empresa",
      "Soma só dos usuários da sua empresa",
    ];
    return (
      <section className="flex-1 flex flex-col">
        <Cabecalho
          rotulo="Admin da Empresa • Dashboard"
          titulo="Visão geral"
          descricao={<>Acompanhamento por usuário da sua empresa: {u.empresa?.nome}. Outras empresas nunca aparecem aqui.</>}
          direita={<span className="chip" style={{ background: "#0b2f1f", color: "#fff" }}><Layers size={12} /> Total</span>}
        />
        {/* Plano por quantidade de envio (decisão #102): saldo da empresa; o Admin compra pacotes */}
        <SaldoDisparos empresa={u.empresa} podeComprar />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
          {KPIS.map((k, i) => (
            <CardKpi key={k.titulo} icone={k.icone} cor={k.cor} valor={valores[i] ?? 0} titulo={k.titulo} sub={subs[i]} selo={seloTotal} />
          ))}
        </div>
        <div className="card p-3 mt-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <h2 className="font-display font-bold text-[14px]">Disparos por usuários</h2>
            <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
              {usuarios.length} {usuarios.length === 1 ? "usuário" : "usuários"} da sua empresa
            </span>
          </div>
          {usuarios.length === 0 ? (
            <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum usuário cadastrado na sua empresa ainda.</p>
          ) : (
            <div className="table-wrap mt-2">
              <table style={{ minWidth: "560px" }}>
                <thead>
                  <tr><th>Usuário</th><th>Enviados</th><th>Em fila</th><th>Bloqueados 24h</th><th>Qualificados pela IA</th></tr>
                </thead>
                <tbody>
                  {usuarios.map((x) => (
                    <tr key={x.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <span style={{ width: 26, height: 26, borderRadius: 999, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                            {(x.nome || "?")[0]}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <b>{x.nome}</b><span style={{ color: "var(--muted)" }}> • {x.email}</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{(m.get(x.id) ?? VAZIO).enviados}</td><td>{(m.get(x.id) ?? VAZIO).fila}</td><td>{(m.get(x.id) ?? VAZIO).bloqueados24h}</td><td>{(m.get(x.id) ?? VAZIO).qualificados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-3 mt-3 flex flex-wrap items-center gap-2">
          <TriangleAlert size={16} style={{ color: "#92400e" }} />
          <b className="text-[13px]">Admin não envia mensagens.</b>
          <span className="text-[12px]" style={{ color: "var(--muted)" }}>Enviar, Conectar WhatsApp e Nova Campanha estão bloqueados para Admin.</span>
        </div>
      </section>
    );
  }

  // ================= USUÁRIO =================
  const dias = diasRestantes(sessao);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = u.nome.split(" ")[0];
  const recentes = await prisma.lead.findMany({ where: { usuarioId: u.id }, orderBy: { criadoEm: "desc" }, take: 5 });
  const [meus, saude, proximos] = await Promise.all([
    metricasPorUsuario([u.id]),
    saudeDoNumero(u.id),
    prisma.envio.findMany({
      where: { status: "PENDENTE", campanha: { usuarioId: u.id, status: "EM_ANDAMENTO" } },
      orderBy: [{ campanha: { iniciadaEm: "asc" } }, { ordem: "asc" }],
      take: 5,
      include: { campanha: { select: { assunto: true } } },
    }),
  ]);
  const mm = meus.get(u.id) ?? VAZIO;
  const valoresUsuario = [mm.fila, mm.enviadosHoje, mm.bloqueados24h, mm.qualificados];
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Visão geral • Hoje"
        titulo={<>{saudacao}, {primeiroNome} 👋</>}
        descricao={dias !== null ? `Seu acesso vale por mais ${dias} ${dias === 1 ? "dia" : "dias"}.` : undefined}
        direita={
          <div className="flex items-center gap-2">
            {u.permissoes.includes("campanhas") && <Link href="/campanhas" className="btn-primary"><Play size={14} /> Criar campanha</Link>}
          </div>
        }
      />
      {/* Saldo de disparos (decisão #102): no Individual o próprio usuário compra; no Empresarial só vê */}
      <SaldoDisparos empresa={u.empresa} podeComprar={u.empresa?.modulo === Modulo.INDIVIDUAL} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
        {KPIS.map((k, i) => (
          <CardKpi key={k.titulo} icone={k.icone} cor={k.cor} valor={valoresUsuario[i] ?? 0} titulo={k.titulo} />
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.55fr_.85fr] gap-3 mt-3">
        <div className="card p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-[14px]">Leads recentes</h2>
            {u.permissoes.includes("leads") && <Link href="/leads" className="text-[12px] font-bold" style={{ color: "var(--primary)" }}>Ver todos os leads →</Link>}
          </div>
          {recentes.length === 0 ? (
            <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum lead ainda.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {recentes.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: "var(--surface-3)" }}>
                  <span className="min-w-0">
                    <b className="text-[12px] [overflow-wrap:anywhere]">{l.nome || "(sem nome)"}</b>
                    <span className="text-[11px] block" style={{ color: "var(--muted)" }}>{l.codigo} • {formatarTelefone(l.telefone)}</span>
                  </span>
                  <span className="chip" style={{ background: STATUS_LEAD[l.status].fundo, color: STATUS_LEAD[l.status].cor }}>{STATUS_LEAD[l.status].rotulo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="card p-3">
            <h3 className="font-display font-bold text-[13px]">Próximos na fila</h3>
            {proximos.length === 0 ? (
              <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Fila vazia.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {proximos.map((e) => (
                  <li key={e.id} className="text-[12px] rounded-lg px-2 py-1.5" style={{ background: "var(--surface-3)" }}>
                    <b>{e.nome || "(sem nome)"}</b> <span style={{ color: "var(--muted)" }}>• {formatarTelefone(e.telefone)} • {e.campanha.assunto}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Saúde do número (decisão #64) */}
          <div className="card p-3" data-testid="saude-numero">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-[13px]">Saúde do seu número</h3>
              <span className="chip" style={{ background: COR_SAUDE[saude.nivel].fundo, color: COR_SAUDE[saude.nivel].cor }}>{saude.rotulo}</span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>Últimos 7 dias • {saude.enviados7d} enviados</p>
            {saude.nivel === "poucos-dados" ? (
              <p className="text-[12px] mt-1.5" style={{ color: "var(--muted)" }}>A avaliação aparece depois de 20 envios na semana.</p>
            ) : (
              <>
                <ul className="text-[12px] mt-1.5 grid grid-cols-2 gap-1">
                  <li>Respostas: <b>{saude.taxaResposta}%</b></li>
                  <li>Falhas: <b>{saude.taxaFalha}%</b></li>
                  <li>Pediram para sair: <b>{saude.taxaSair}%</b></li>
                  <li>Sem WhatsApp: <b>{saude.taxaSemWhatsapp}%</b></li>
                </ul>
                {saude.dicas.length > 0 && (
                  <ul className="text-[11px] mt-1.5 list-disc pl-4" style={{ color: "#8a5a00" }}>
                    {saude.dicas.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
