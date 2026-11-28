// Criação de contas a partir de uma compra confirmada ou do teste grátis.
// Cria a "Empresa" (no Individual, a conta da própria pessoa) e o usuário,
// com link de uso único para criar a senha, enviado por e-mail (decisão #165 — S9 Fase 2 do Módulo 1).
import "server-only";
import { prisma, proximoCodigo, Cargo, Modulo, type Prisma } from "@filapro/db";
import { VALIDADE_LINK_ACESSO_MIN, novoLink, urlDoLink } from "@/lib/auth/link-senha";
import { enviarEmail } from "@/lib/email";

/** O link para criar a senha de uma conta nova vale 7 dias (era a validade da senha temporária). */
export const VALIDADE_LINK_CONTA_NOVA_DIAS = VALIDADE_LINK_ACESSO_MIN / 1440;

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
  /** Pacotes de usuários (Empresarial — decisão #113): disparos por período = plano × pacotes */
  pacotes?: number;
  usuario: { nome: string; email: string; whatsapp?: string | null };
};

/** Cria conta + usuário (Admin da Empresa no Empresarial; Usuário no Individual). */
export async function criarConta(dados: NovaConta, tx: Prisma.TransactionClient = prisma) {
  const link = novoLink(VALIDADE_LINK_ACESSO_MIN);
  const empresarial = dados.modulo === Modulo.EMPRESARIAL;
  // Códigos (decisão #63): empresa "E…" + Admin "EU…"; individual: conta e usuário com o mesmo número.
  const codigoConta = await proximoCodigo(tx, empresarial ? "empresa" : "individual");
  const codigoUsuario = empresarial ? await proximoCodigo(tx, "usuario_empresa") : codigoConta;
  // Limites de treinamento da IA vêm do plano (decisão #77); o Super Admin pode ajustar depois
  const plano = dados.planoId ? await tx.plano.findUnique({ where: { id: dados.planoId }, select: { limiteMateriais: true, limitePaginasMes: true, leadsAnuncios: true, redesSociais: true, permiteDisparos: true, disparosPorPeriodo: true } }) : null;
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
      // Teste grátis: o limite do teste; plano por quantidade: os disparos por período (decisão #102)
      limiteDisparos: dados.limiteDisparos ?? (plano?.disparosPorPeriodo != null ? plano.disparosPorPeriodo * Math.max(1, dados.pacotes ?? 1) : null),
      pacotes: Math.max(1, dados.pacotes ?? 1),
      limiteLeads: dados.limiteLeads ?? null,
      limiteMateriais: plano?.limiteMateriais ?? null,
      limitePaginasMes: plano?.limitePaginasMes ?? null,
      // Leads de anúncios vem do plano (decisões #90 e #94)
      leadsAnuncios: plano?.leadsAnuncios ?? false,
      // Redes Sociais e disparos vêm do plano (decisão #185)
      redesSociais: plano?.redesSociais ?? false,
      permiteDisparos: plano?.permiteDisparos ?? true,
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
      // Conta nova nasce SEM senha: entra depois de criá-la pelo link do e-mail (decisão #165)
      linkSenhaHash: link.hash,
      linkSenhaExpiraEm: link.expira,
    },
  });
  return { empresa, usuario, linkSenha: link.token };
}

/**
 * E-mail de acesso novo com o link para criar a senha (decisão #165): nunca leva senha.
 * tipo "redefinicao": o Admin/Super Admin pediu para a pessoa criar uma nova senha (a anterior deixou de valer).
 */
export async function enviarEmailBoasVindas(nome: string, email: string, linkSenha: string, plano: string, modulo: Modulo, tipo: "novo" | "redefinicao" = "novo") {
  const aba = modulo === Modulo.EMPRESARIAL ? "Módulo Business" : "Módulo Individual";
  const link = urlDoLink(linkSenha);
  const dias = VALIDADE_LINK_CONTA_NOVA_DIAS;
  const abertura = tipo === "redefinicao"
    ? `Seu acesso ao FilaPro Leads${plano ? ` (plano ${plano})` : ""} foi redefinido: a senha anterior deixou de valer e é preciso criar uma nova.`
    : `Seu acesso ao FilaPro Leads${plano ? ` (plano ${plano})` : ""} está pronto.`;
  const texto =
    `Olá, ${nome}.\n\n${abertura}\n\n` +
    `Para criar sua senha, abra o link abaixo (vale por ${dias} dias e só pode ser usado uma vez):\n\n${link}\n\n` +
    `Depois, entre em ${SITE} com o e-mail ${email} e escolha "${aba}" na tela de login.\n\n` +
    `Se o link expirar, use "Esqueci minha senha" na tela de login para receber outro.`;
  const html =
    `<p>Olá, ${nome}.</p><p>${abertura.replace("FilaPro Leads", "<b>FilaPro Leads</b>")}</p>` +
    `<p>Para criar sua senha, use o botão abaixo. O link vale por <b>${dias} dias</b> e só pode ser usado <b>uma vez</b>.</p>` +
    `<p><a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:bold;padding:12px 20px;border-radius:10px;text-decoration:none">Criar minha senha</a></p>` +
    `<p style="font-size:12px;color:#5b6b62">Se o botão não abrir, copie este endereço no navegador:<br>${link}</p>` +
    `<p>Depois, entre em <a href="${SITE}">${SITE}</a> com o e-mail <b>${email}</b> e escolha <b>${aba}</b> na tela de login.</p>` +
    `<p style="color:#5b6b62">Se o link expirar, use “Esqueci minha senha” na tela de login para receber outro.</p>`;
  return enviarEmail({ para: email, assunto: tipo === "redefinicao" ? "Crie uma nova senha — FilaPro Leads" : "Seu acesso ao FilaPro Leads", texto, html });
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
  const link = novoLink(VALIDADE_LINK_ACESSO_MIN);
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
      linkSenhaHash: link.hash,
      linkSenhaExpiraEm: link.expira,
    },
  });
  return { usuario, linkSenha: link.token };
}
