// Criação de contas a partir de uma compra confirmada ou do teste grátis.
// Cria a "Empresa" (no Individual, a conta da própria pessoa) e o usuário,
// com senha temporária enviada por e-mail (troca obrigatória no 1º acesso).
import "server-only";
import { prisma, gerarHash, gerarSenhaTemporaria, proximoCodigo, Cargo, Modulo, type Prisma } from "@filapro/db";
import { enviarEmail } from "@/lib/email";

/** Senha temporária de conta nova vale 7 dias (mesma regra do Super Admin na instalação). */
export const VALIDADE_TEMP_CONTA_NOVA_DIAS = 7;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";

/** Prorrogar (decisão #40): soma os dias ao vencimento atual; se já venceu, a partir de hoje. */
export function novoVencimento(expiraEm: Date, dias: number) {
  const base = expiraEm > new Date() ? new Date(expiraEm) : new Date();
  base.setHours(23, 59, 59, 999);
  base.setDate(base.getDate() + dias);
  return base;
}

export function fimDoPrazo(dias: number) {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + dias);
  return d;
}

export type NovaConta = {
  modulo: Modulo;
  nomeConta: string;
  pacote: string;
  planoId?: string | null;
  limiteUsuarios: number;
  prazoDias: number;
  limiteDisparos?: number | null;
  /** Limite de leads da conta (decisão #58). Vazio = ilimitado. */
  limiteLeads?: number | null;
  /** WhatsApps extras comprados junto com o plano (Individual — decisão #95) */
  whatsappsExtras?: number;
  usuario: { nome: string; email: string; whatsapp?: string | null };
};

/** Cria conta + usuário (Admin da Empresa no Empresarial; Usuário no Individual). */
export async function criarConta(dados: NovaConta, tx: Prisma.TransactionClient = prisma) {
  const temp = gerarSenhaTemporaria();
  const empresarial = dados.modulo === Modulo.EMPRESARIAL;
  // Códigos (decisão #63): empresa "E…" + Admin "EU…"; individual: conta e usuário com o mesmo número.
  const codigoConta = await proximoCodigo(tx, empresarial ? "empresa" : "individual");
  const codigoUsuario = empresarial ? await proximoCodigo(tx, "usuario_empresa") : codigoConta;
  // Limites de treinamento da IA vêm do plano (decisão #77); o Super Admin pode ajustar depois
  const plano = dados.planoId ? await tx.plano.findUnique({ where: { id: dados.planoId }, select: { limiteMateriais: true, limitePaginasMes: true, leadsAnuncios: true } }) : null;
  const empresa = await tx.empresa.create({
    data: {
      codigo: codigoConta,
      nome: dados.nomeConta,
      modulo: dados.modulo,
      pacote: dados.pacote,
      planoId: dados.planoId ?? null,
      limiteUsuarios: dados.limiteUsuarios,
      prazoDias: dados.prazoDias,
      expiraEm: fimDoPrazo(dados.prazoDias),
      limiteDisparos: dados.limiteDisparos ?? null,
      limiteLeads: dados.limiteLeads ?? null,
      limiteMateriais: plano?.limiteMateriais ?? null,
      limitePaginasMes: plano?.limitePaginasMes ?? null,
      // Leads de anúncios vem do plano (decisões #90 e #94)
      leadsAnuncios: plano?.leadsAnuncios ?? false,
      whatsappsExtras: dados.modulo === Modulo.INDIVIDUAL ? dados.whatsappsExtras ?? 0 : 0,
    },
  });
  const usuario = await tx.usuario.create({
    data: {
      codigo: codigoUsuario,
      nome: dados.usuario.nome,
      email: dados.usuario.email.toLowerCase(),
      whatsapp: dados.usuario.whatsapp || null,
      cargo: dados.modulo === Modulo.EMPRESARIAL ? Cargo.ADMIN_EMPRESA : Cargo.USUARIO,
      empresaId: empresa.id,
      senhaTempHash: await gerarHash(temp),
      senhaTempExpiraEm: new Date(Date.now() + VALIDADE_TEMP_CONTA_NOVA_DIAS * 86400000),
    },
  });
  return { empresa, usuario, senhaTemporaria: temp };
}

export async function enviarEmailBoasVindas(nome: string, email: string, senha: string, plano: string, modulo: Modulo) {
  const aba = modulo === Modulo.EMPRESARIAL ? "Módulo Empresarial" : "Módulo Individual";
  const texto =
    `Olá, ${nome}.\n\nSeu acesso ao FilaPro Leads (plano ${plano}) está pronto.\n\n` +
    `Endereço: ${SITE}\nE-mail: ${email}\nSenha temporária: ${senha}\n\n` +
    `Na tela de login, escolha "${aba}". No primeiro acesso você vai criar uma nova senha ` +
    `(mínimo de 12 caracteres). A senha temporária vale por ${VALIDADE_TEMP_CONTA_NOVA_DIAS} dias.`;
  const html =
    `<p>Olá, ${nome}.</p><p>Seu acesso ao <b>FilaPro Leads</b> (plano <b>${plano}</b>) está pronto.</p>` +
    `<p>Endereço: <a href="${SITE}">${SITE}</a><br>E-mail: <b>${email}</b><br>Senha temporária: ` +
    `<b style="font-family:monospace;font-size:16px">${senha}</b></p>` +
    `<p>Na tela de login, escolha <b>${aba}</b>. No primeiro acesso você vai criar uma nova senha ` +
    `(mínimo de 12 caracteres). A senha temporária vale por ${VALIDADE_TEMP_CONTA_NOVA_DIAS} dias.</p>`;
  return enviarEmail({ para: email, assunto: "Seu acesso ao FilaPro Leads", texto, html });
}

/** Validações simples dos dados do comprador. */
export function validarComprador(c: { nome: string; email: string; whatsapp: string; empresaNome?: string }, exigeEmpresa: boolean) {
  if (c.nome.trim().length < 3) return "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return "Informe um e-mail válido.";
  const dig = c.whatsapp.replace(/\D/g, "");
  if (dig.length < 10 || dig.length > 13) return "Informe um WhatsApp válido com DDD.";
  if (exigeEmpresa && (c.empresaNome || "").trim().length < 2) return "Informe o nome da empresa.";
  return null;
}

/** Cria um usuário dentro de uma empresa existente (Admin da Empresa — etapa 5). */
export async function criarUsuarioNaEmpresa(
  empresaId: string,
  u: { nome: string; email: string; whatsapp: string; permissoes: string[]; limiteLeads?: number | null },
) {
  const temp = gerarSenhaTemporaria();
  const usuario = await prisma.usuario.create({
    data: {
      codigo: await proximoCodigo(prisma, "usuario_empresa"),
      nome: u.nome,
      email: u.email.toLowerCase(),
      whatsapp: u.whatsapp,
      cargo: Cargo.USUARIO,
      empresaId,
      permissoes: u.permissoes,
      limiteLeads: u.limiteLeads ?? null,
      senhaTempHash: await gerarHash(temp),
      senhaTempExpiraEm: new Date(Date.now() + VALIDADE_TEMP_CONTA_NOVA_DIAS * 86400000),
    },
  });
  return { usuario, senhaTemporaria: temp };
}
