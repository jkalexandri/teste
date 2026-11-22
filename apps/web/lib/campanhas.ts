// Regras das campanhas no site (etapa 8a — prompt seção 8, decisões #57, #62, #64–#68).
import "server-only";
import { prisma, Cargo, Modulo, StatusLead, StatusCampanha, type Prisma } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { DIAS_BLOQUEIO_SAIR } from "@/lib/leads-status";

/** Quem pode ter campanhas: Usuário com a permissão "campanhas" e o Super Admin (decisão #62). Admin da Empresa não envia. */
export async function atorCampanhas() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  const u = s.usuario;
  const pode = u.cargo === Cargo.SUPERADMIN || (u.cargo === Cargo.USUARIO && u.permissoes.includes("campanhas"));
  if (!pode) throw new Error("Acesso negado.");
  return u;
}

export type DadosCampanha = {
  id?: string | null;
  assunto: string;
  referencia: string;
  mensagem: string;
  variacoes: string[];
  modo: "CONSERVADOR" | "EQUILIBRADO" | "RAPIDO";
  bloqueio24h: boolean;
  descadastro: boolean;
  textoDescadastro: string;
  incluirDataHora: boolean;
  eliminarDuplicados: boolean;
  randomizar: boolean;
  selecaoTodos: boolean;
  selecaoStatus: string[];
  leadsEscolhidos: string[];
  manterQuemSaiu: string[];
  arquivoId: string | null;
  /** Números que enviam (rodízio — decisão #79); vazio = o principal */
  sessoes: string[];
};

const MODOS_OK = ["CONSERVADOR", "EQUILIBRADO", "RAPIDO"];
const STATUS_OK = Object.values(StatusLead) as string[];
const texto = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const lista = (v: unknown, max = 50_000) => (Array.isArray(v) ? v.map(String).slice(0, max) : []);

/** Limpa o que veio do navegador antes de gravar. */
export function limparDados(d: DadosCampanha): Omit<DadosCampanha, "id"> {
  return {
    assunto: texto(d.assunto, 120).trim(),
    referencia: texto(d.referencia, 4000),
    mensagem: texto(d.mensagem, 4000),
    variacoes: lista(d.variacoes, 3).map((v) => v.slice(0, 4000)),
    modo: (MODOS_OK.includes(d.modo) ? d.modo : "CONSERVADOR") as DadosCampanha["modo"],
    bloqueio24h: !!d.bloqueio24h,
    descadastro: !!d.descadastro,
    textoDescadastro: texto(d.textoDescadastro, 300),
    incluirDataHora: !!d.incluirDataHora,
    eliminarDuplicados: !!d.eliminarDuplicados,
    randomizar: !!d.randomizar,
    selecaoTodos: !!d.selecaoTodos,
    selecaoStatus: lista(d.selecaoStatus, 10).filter((s) => STATUS_OK.includes(s)),
    leadsEscolhidos: lista(d.leadsEscolhidos),
    manterQuemSaiu: lista(d.manterQuemSaiu),
    arquivoId: d.arquivoId ? String(d.arquivoId) : null,
    sessoes: lista(d.sessoes, 10),
  };
}

/**
 * Leads que a campanha vai alcançar (decisões #56 e #57):
 * - só leads ATIVOS do próprio usuário;
 * - "Pediu para sair" há menos de 45 dias: bloqueado;
 * - há mais de 45 dias: sai, a não ser que o usuário tenha escolhido manter.
 */
export async function resolverLeads(usuarioId: string, d: Pick<DadosCampanha, "selecaoTodos" | "selecaoStatus" | "leadsEscolhidos" | "manterQuemSaiu">) {
  const base: Prisma.LeadWhereInput = { usuarioId, ativo: true };
  if (d.selecaoTodos) {
    if (d.selecaoStatus.length) base.status = { in: d.selecaoStatus as StatusLead[] };
  } else {
    base.id = { in: d.leadsEscolhidos.length ? d.leadsEscolhidos : ["-"] };
  }
  const leads = await prisma.lead.findMany({ where: base, select: { id: true, codigo: true, nome: true, telefone: true, status: true, pediuSairEm: true }, orderBy: { criadoEm: "asc" } });
  const limite45 = Date.now() - DIAS_BLOQUEIO_SAIR * 86400000;
  const enviar: typeof leads = [];
  const bloqueados: typeof leads = [];
  const antigosSair: typeof leads = [];
  for (const l of leads) {
    if (l.status === StatusLead.PEDIU_SAIR) {
      if (!l.pediuSairEm || l.pediuSairEm.getTime() > limite45) bloqueados.push(l);
      else if (d.manterQuemSaiu.includes(l.id)) enviar.push(l);
      else antigosSair.push(l);
    } else enviar.push(l);
  }
  return { enviar, bloqueados, antigosSair };
}

/** Disparos que o teste grátis ainda permite (decisão #34). null = sem limite. */
export async function disparosRestantes(empresa: { id: string; limiteDisparos: number | null } | null) {
  if (!empresa || empresa.limiteDisparos == null) return null;
  const usados = await prisma.envio.count({ where: { campanha: { empresaId: empresa.id }, status: "ENVIADO" } });
  return Math.max(0, empresa.limiteDisparos - usados);
}

/** Janela da conta (empresa / individual) ou do Super Admin. */
export async function janelaDe(u: { cargo: Cargo; empresa: { janelaInicio: number; janelaFim: number; modulo: Modulo } | null }) {
  const global = await prisma.configEnvio.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  const janela = u.cargo === Cargo.SUPERADMIN || !u.empresa
    ? { inicio: global.janelaInicioSuperAdmin, fim: global.janelaFimSuperAdmin }
    : { inicio: u.empresa.janelaInicio, fim: u.empresa.janelaFim };
  return { janela, global };
}

/** Campanhas que ainda podem ser editadas no formulário "Nova". */
export const EDITAVEIS: StatusCampanha[] = [StatusCampanha.RASCUNHO];

/** Números de WhatsApp do usuário que podem enviar (não bloqueados), com o principal primeiro (etapa 10c). */
export async function numerosParaCampanha(usuarioId: string) {
  const ss = await prisma.whatsappSessao.findMany({ where: { usuarioId, bloqueada: false }, orderBy: { ordem: "asc" } });
  const principal = ss.find((s) => s.id === usuarioId);
  const extras = ss.filter((s) => s.id !== usuarioId);
  return [
    { id: usuarioId, rotulo: principal?.apelido ? `WhatsApp principal — ${principal.apelido}` : "WhatsApp principal", conectado: principal?.status === "CONECTADO" },
    ...extras.map((s, i) => ({ id: s.id, rotulo: s.apelido ? `WhatsApp ${i + 2} — ${s.apelido}` : `WhatsApp ${i + 2}`, conectado: s.status === "CONECTADO" })),
  ];
}

/** Só os números do próprio usuário (e não bloqueados) entram na campanha. */
export async function validarSessoes(usuarioId: string, sessoes: string[]) {
  const validos = new Set((await numerosParaCampanha(usuarioId)).map((n) => n.id));
  const r = sessoes.filter((s) => validos.has(s));
  return r.length ? r : [usuarioId];
}
