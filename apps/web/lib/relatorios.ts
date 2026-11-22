// Relatórios do Super Admin (etapa 11 — especificação seção 6 e decisão #96).
// As telas, a impressão e o Excel usam as mesmas funções, para mostrar sempre os mesmos números.
import "server-only";
import { prisma, Cargo, Modulo, StatusLead, type Prisma } from "@filapro/db";
import { formatarTelefone } from "@/lib/telefone";
import { STATUS_LEAD, LISTA_STATUS } from "@/lib/leads-status";

export const POR_PAGINA = 100;
/** Máximo de linhas na impressão e no Excel */
export const MAX_EXPORTAR = 50_000;

export type Tabela = { colunas: string[]; linhas: (string | number)[][] };
export type Filtros = { usuario?: string; status?: string; de?: string; ate?: string; ativos?: string; pagina?: number };

const data = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const TEMP: Record<string, string> = { QUENTE: "Quente", MORNO: "Morno", FRIO: "Frio" };

// ===================== Listas para escolher a conta =====================

export async function empresasParaRelatorio() {
  const es = await prisma.empresa.findMany({ where: { modulo: Modulo.EMPRESARIAL }, orderBy: { nome: "asc" }, select: { id: true, nome: true, codigo: true } });
  return es.map((e) => ({ id: e.id, rotulo: `${e.codigo ?? ""} • ${e.nome}`.replace(/^ • /, "") }));
}

/** Usuários individuais (sem misturar com empresas). `comSuperAdmin`: inclui "Super Admin (meus leads)" — decisão #96. */
export async function individuaisParaRelatorio(superAdminId?: string) {
  const us = await prisma.usuario.findMany({
    where: { cargo: Cargo.USUARIO, empresa: { modulo: Modulo.INDIVIDUAL } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, email: true, codigo: true },
  });
  const lista = us.map((u) => ({ id: u.id, rotulo: `${u.codigo ?? ""} • ${u.nome} (${u.email})`.replace(/^ • /, "") }));
  return superAdminId ? [{ id: superAdminId, rotulo: "Super Admin (meus leads)" }, ...lista] : lista;
}

// ===================== 1 e 2. Empresarial e Individual =====================

/** Empresa: nome, pacote, expiração, usuários com a quantidade de leads de cada um e o total (soma). */
export async function relatorioEmpresarial(empresaId: string) {
  const e = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: { usuarios: { orderBy: [{ cargo: "asc" }, { nome: "asc" }], include: { _count: { select: { leads: true } } } } },
  });
  if (!e || e.modulo !== Modulo.EMPRESARIAL) return null;
  const linhas = e.usuarios.map((u) => [u.codigo ?? "", u.nome, u.email, u.cargo === Cargo.ADMIN_EMPRESA ? "Admin da Empresa" : "Usuário", u._count.leads]);
  const total = e.usuarios.reduce((s, u) => s + u._count.leads, 0);
  return {
    titulo: `Relatório Empresarial — ${e.nome}`,
    resumo: [["Empresa", `${e.codigo ?? ""} ${e.nome}`.trim()], ["Pacote", e.pacote], ["Expira em", data(e.expiraEm)], ["Usuários", String(e.usuarios.length)], ["Total de leads da empresa", total.toLocaleString("pt-BR")]],
    tabela: { colunas: ["Código", "Usuário", "E-mail", "Perfil", "Leads"], linhas: [...linhas, ["", "Total da empresa", "", "", total]] } as Tabela,
  };
}

/** Usuário individual: nome, pacote, expiração, quantidade de leads e total. */
export async function relatorioIndividual(usuarioId: string) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { empresa: true, _count: { select: { leads: true } } } });
  if (!u || u.cargo !== Cargo.USUARIO || u.empresa?.modulo !== Modulo.INDIVIDUAL) return null;
  const ativos = await prisma.lead.count({ where: { usuarioId, ativo: true } });
  return {
    titulo: `Relatório Individual — ${u.nome}`,
    resumo: [["Usuário", `${u.codigo ?? ""} ${u.nome}`.trim()], ["E-mail", u.email], ["Pacote", u.empresa.pacote], ["Expira em", data(u.empresa.expiraEm)], ["Total de leads", u._count.leads.toLocaleString("pt-BR")]],
    tabela: {
      colunas: ["Leads ativos", "Leads inativos", "Total"],
      linhas: [[ativos, u._count.leads - ativos, u._count.leads]],
    } as Tabela,
  };
}

// ===================== 3 e 4. Leads Empresarial e Lead Individual =====================

function filtroLeads(base: Prisma.LeadWhereInput, f: Filtros): Prisma.LeadWhereInput {
  const w: Prisma.LeadWhereInput = { ...base };
  if (f.usuario) w.usuarioId = f.usuario;
  if (f.status && LISTA_STATUS.includes(f.status as never)) w.status = f.status as StatusLead;
  if (f.ativos === "ativos") w.ativo = true;
  if (f.ativos === "inativos") w.ativo = false;
  const de = f.de ? new Date(`${f.de}T00:00:00-03:00`) : null;
  const ate = f.ate ? new Date(`${f.ate}T23:59:59.999-03:00`) : null;
  if ((de && !Number.isNaN(de.getTime())) || (ate && !Number.isNaN(ate.getTime()))) {
    w.criadoEm = { ...(de && !Number.isNaN(de.getTime()) ? { gte: de } : {}), ...(ate && !Number.isNaN(ate.getTime()) ? { lte: ate } : {}) };
  }
  return w;
}

async function tabelaLeads(onde: Prisma.LeadWhereInput, f: Filtros, tudo: boolean, comUsuario: boolean) {
  const pagina = Math.max(1, f.pagina ?? 1);
  const [total, leads] = await Promise.all([
    prisma.lead.count({ where: onde }),
    prisma.lead.findMany({
      where: onde,
      orderBy: [{ criadoEm: "desc" }, { codigo: "desc" }],
      skip: tudo ? 0 : (pagina - 1) * POR_PAGINA,
      take: tudo ? MAX_EXPORTAR : POR_PAGINA,
      include: comUsuario ? { usuario: { select: { nome: true } } } : undefined,
    }),
  ]);
  const colunas = ["Data", "Código", "Nome", "Telefone", "Status", "Temperatura", ...(comUsuario ? ["Usuário"] : []), "Situação"];
  const linhas = leads.map((l) => [
    data(l.criadoEm), l.codigo, l.nome || "—", formatarTelefone(l.telefone), STATUS_LEAD[l.status as keyof typeof STATUS_LEAD]?.rotulo ?? l.status,
    l.qualificacao ? TEMP[l.qualificacao] ?? l.qualificacao : "—",
    ...(comUsuario ? [(l as typeof l & { usuario?: { nome: string } }).usuario?.nome ?? ""] : []),
    l.ativo ? "Ativo" : "Inativo",
  ]);
  return { total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), tabela: { colunas, linhas } as Tabela };
}

/** Leads de uma empresa: data, nome, telefone e status; filtro por usuário e status (+ período e situação — #96). */
export async function relatorioLeadsEmpresarial(empresaId: string, f: Filtros, tudo = false) {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, include: { usuarios: { where: { cargo: Cargo.USUARIO }, orderBy: { nome: "asc" }, select: { id: true, nome: true } } } });
  if (!e || e.modulo !== Modulo.EMPRESARIAL) return null;
  const usuario = f.usuario && e.usuarios.some((u) => u.id === f.usuario) ? f.usuario : undefined;
  const t = await tabelaLeads(filtroLeads({ empresaId }, { ...f, usuario }), f, tudo, true);
  return { titulo: `Leads Empresarial — ${e.nome}`, nome: e.nome, usuarios: e.usuarios, ...t };
}

/** Leads de um usuário individual (ou do próprio Super Admin). */
export async function relatorioLeadIndividual(usuarioId: string, f: Filtros, tudo = false) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { empresa: true } });
  const valido = u && (u.cargo === Cargo.SUPERADMIN || (u.cargo === Cargo.USUARIO && u.empresa?.modulo === Modulo.INDIVIDUAL));
  if (!u || !valido) return null;
  const t = await tabelaLeads(filtroLeads({ usuarioId }, { ...f, usuario: undefined }), f, tudo, false);
  const nome = u.cargo === Cargo.SUPERADMIN ? "Super Admin (meus leads)" : u.nome;
  return { titulo: `Lead Individual — ${nome}`, nome, ...t };
}

// ===================== 5. Campanhas (decisão #96) =====================

/**
 * Por campanha, no período (data de criação): leads, enviadas, falhas, puladas, respostas e pedidos para sair.
 * `conta`: "e:<empresaId>" (empresa), "u:<usuarioId>" (individual ou Super Admin) ou "" (todas).
 */
export async function relatorioCampanhas(conta: string, f: Filtros, tudo = false) {
  const where: Prisma.CampanhaWhereInput = {};
  if (conta.startsWith("e:")) where.empresaId = conta.slice(2);
  else if (conta.startsWith("u:")) where.usuarioId = conta.slice(2);
  const de = f.de ? new Date(`${f.de}T00:00:00-03:00`) : null;
  const ate = f.ate ? new Date(`${f.ate}T23:59:59.999-03:00`) : null;
  if (de || ate) where.criadoEm = { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) };
  where.status = { not: "RASCUNHO" };
  const pagina = Math.max(1, f.pagina ?? 1);
  const [total, campanhas] = await Promise.all([
    prisma.campanha.count({ where }),
    prisma.campanha.findMany({
      where, orderBy: { criadoEm: "desc" }, skip: tudo ? 0 : (pagina - 1) * POR_PAGINA, take: tudo ? MAX_EXPORTAR : POR_PAGINA,
      include: { usuario: { select: { nome: true } }, empresa: { select: { nome: true } } },
    }),
  ]);
  const ids = campanhas.map((c) => c.id);
  const contas = ids.length
    ? await prisma.$queryRaw<{ id: string; enviadas: bigint; falhas: bigint; puladas: bigint; respostas: bigint; sairam: bigint }[]>`
        SELECT e."campanhaId" AS id,
          count(*) FILTER (WHERE e.status = 'ENVIADO') AS enviadas,
          count(*) FILTER (WHERE e.status = 'FALHOU') AS falhas,
          count(*) FILTER (WHERE e.status = 'PULADO') AS puladas,
          count(*) FILTER (WHERE e.status = 'ENVIADO' AND l."ultimaRespostaEm" > e."enviadoEm") AS respostas,
          count(*) FILTER (WHERE e.status = 'ENVIADO' AND l."pediuSairEm" > e."enviadoEm") AS sairam
        FROM "Envio" e LEFT JOIN "Lead" l ON l.id = e."leadId"
        WHERE e."campanhaId" = ANY(${ids})
        GROUP BY e."campanhaId"`
    : [];
  const por = new Map(contas.map((c) => [c.id, c]));
  const STATUS: Record<string, string> = { AGENDADA: "Agendada", EM_ANDAMENTO: "Em andamento", PAUSADA: "Pausada", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
  const soma = { leads: 0, enviadas: 0, falhas: 0, puladas: 0, respostas: 0, sairam: 0 };
  const linhas = campanhas.map((c) => {
    const x = por.get(c.id);
    const v = { enviadas: Number(x?.enviadas ?? 0), falhas: Number(x?.falhas ?? 0), puladas: Number(x?.puladas ?? 0), respostas: Number(x?.respostas ?? 0), sairam: Number(x?.sairam ?? 0) };
    soma.leads += c.totalLeads; soma.enviadas += v.enviadas; soma.falhas += v.falhas; soma.puladas += v.puladas; soma.respostas += v.respostas; soma.sairam += v.sairam;
    const taxa = v.enviadas ? `${(Math.round((v.respostas / v.enviadas) * 1000) / 10).toLocaleString("pt-BR")}%` : "—";
    return [data(c.criadoEm), c.assunto || "(sem assunto)", c.empresa?.nome ?? "—", c.usuario.nome, STATUS[c.status] ?? c.status, c.totalLeads, v.enviadas, v.falhas, v.puladas, v.respostas, taxa, v.sairam];
  });
  const taxaTotal = soma.enviadas ? `${(Math.round((soma.respostas / soma.enviadas) * 1000) / 10).toLocaleString("pt-BR")}%` : "—";
  return {
    titulo: "Relatório de campanhas",
    total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    tabela: {
      colunas: ["Data", "Campanha", "Empresa", "Usuário", "Status", "Leads", "Enviadas", "Falhas", "Puladas", "Respostas", "Taxa de resposta", "Pediram para sair"],
      linhas: linhas.length ? [...linhas, ["", tudo || total <= POR_PAGINA ? "Total" : "Total desta página", "", "", "", soma.leads, soma.enviadas, soma.falhas, soma.puladas, soma.respostas, taxaTotal, soma.sairam]] : [],
    } as Tabela,
  };
}

/** Contas para o relatório de campanhas: empresas, individuais e o Super Admin. */
export async function contasParaCampanhas(superAdminId: string) {
  const [es, us] = await Promise.all([empresasParaRelatorio(), individuaisParaRelatorio()]);
  return [
    { id: "", rotulo: "Todas as contas" },
    { id: `u:${superAdminId}`, rotulo: "Super Admin (minhas campanhas)" },
    ...es.map((e) => ({ id: `e:${e.id}`, rotulo: `Empresa: ${e.rotulo}` })),
    ...us.map((u) => ({ id: `u:${u.id}`, rotulo: `Individual: ${u.rotulo}` })),
  ];
}

// ===================== Um ponto de entrada para tela, impressão e Excel =====================

export const TIPOS = {
  empresarial: "Relatório Empresarial",
  individual: "Relatório Individual",
  "leads-empresarial": "Leads Empresarial",
  "lead-individual": "Lead Individual",
  campanhas: "Relatório de campanhas",
} as const;
export type TipoRelatorio = keyof typeof TIPOS;

export type Parametros = { conta?: string; usuario?: string; status?: string; de?: string; ate?: string; ativos?: string; pagina?: string };

export type Resultado = {
  titulo: string;
  resumo?: string[][];
  tabela: Tabela;
  total?: number; pagina?: number; paginas?: number;
  /** Usuários da empresa (filtro do Leads Empresarial) */
  usuarios?: { id: string; nome: string }[];
};

/** Gera o relatório pedido. null = conta não escolhida ou inválida. */
export async function gerarRelatorio(tipo: TipoRelatorio, p: Parametros, superAdminId: string, tudo = false): Promise<Resultado | null> {
  const f: Filtros = { usuario: p.usuario, status: p.status, de: p.de, ate: p.ate, ativos: p.ativos, pagina: Number(p.pagina) || 1 };
  const conta = p.conta ?? "";
  if (tipo === "campanhas") return relatorioCampanhas(conta, f, tudo);
  if (!conta) return null;
  if (tipo === "empresarial") return relatorioEmpresarial(conta);
  if (tipo === "individual") return relatorioIndividual(conta);
  if (tipo === "leads-empresarial") return relatorioLeadsEmpresarial(conta, f, tudo);
  return relatorioLeadIndividual(conta, f, tudo);
}

/** Contas que aparecem para escolher em cada relatório. */
export async function contasDoRelatorio(tipo: TipoRelatorio, superAdminId: string) {
  if (tipo === "empresarial" || tipo === "leads-empresarial") return empresasParaRelatorio();
  if (tipo === "individual") return individuaisParaRelatorio();
  if (tipo === "lead-individual") return individuaisParaRelatorio(superAdminId);
  return contasParaCampanhas(superAdminId);
}
