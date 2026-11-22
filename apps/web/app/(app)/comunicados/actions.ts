"use server";

// Mensagens aos usuários (decisão #102): o Super Admin envia um aviso que aparece em popup no centro da tela
// (fecha só com OK). Quem está offline vê no próximo acesso. Sem cópia por WhatsApp ou e-mail.
import { revalidatePath } from "next/cache";
import { prisma, Cargo, Modulo, type Prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";

type R = { ok: boolean; mensagem: string };

/** Quem recebe: todos os clientes, um grupo ou pessoas escolhidas. */
async function destinatarios(publico: string, selecionados: string[]): Promise<{ ids: string[]; descricao: string } | null> {
  const base: Prisma.UsuarioWhereInput = { cargo: { not: Cargo.SUPERADMIN }, status: "ATIVO" };
  let where: Prisma.UsuarioWhereInput;
  let descricao: string;
  if (publico === "todos") { where = base; descricao = "Todos os clientes"; }
  else if (publico === "admins") { where = { ...base, cargo: Cargo.ADMIN_EMPRESA }; descricao = "Admins das empresas"; }
  else if (publico === "usuarios-empresa") { where = { ...base, cargo: Cargo.USUARIO, empresa: { modulo: Modulo.EMPRESARIAL } }; descricao = "Usuários das empresas"; }
  else if (publico === "individuais") { where = { ...base, empresa: { modulo: Modulo.INDIVIDUAL } }; descricao = "Usuários individuais"; }
  else if (publico.startsWith("empresa:")) {
    const e = await prisma.empresa.findUnique({ where: { id: publico.slice(8) }, select: { id: true, nome: true } });
    if (!e) return null;
    where = { ...base, empresaId: e.id }; descricao = `Empresa: ${e.nome}`;
  } else if (publico === "selecionados") {
    if (!selecionados.length) return null;
    where = { ...base, id: { in: selecionados } }; descricao = "";
  } else return null;
  const ids = (await prisma.usuario.findMany({ where, select: { id: true } })).map((x) => x.id);
  if (publico === "selecionados") descricao = `${ids.length} selecionado${ids.length === 1 ? "" : "s"}`;
  return { ids, descricao };
}

export async function enviarComunicado(form: FormData): Promise<R> {
  const s = await exigirSuperAdmin();
  const titulo = String(form.get("titulo") ?? "").trim().slice(0, 120);
  const texto = String(form.get("texto") ?? "").trim().slice(0, 3000);
  const link = String(form.get("link") ?? "").trim();
  const validade = String(form.get("validoAte") ?? "").trim();
  const publico = String(form.get("publico") ?? "");
  const selecionados = form.getAll("selecionados").map(String).filter(Boolean);
  if (!titulo || !texto) return { ok: false, mensagem: "Preencha o título e a mensagem." };
  if (link && !/^https:\/\/[^\s]+$/i.test(link)) return { ok: false, mensagem: "O link precisa começar com https://" };
  let validoAte: Date | null = null;
  if (validade) {
    validoAte = new Date(`${validade}T23:59:59.999-03:00`);
    if (isNaN(+validoAte) || validoAte < new Date()) return { ok: false, mensagem: "A validade precisa ser hoje ou uma data futura." };
  }
  const d = await destinatarios(publico, selecionados);
  if (!d) return { ok: false, mensagem: "Escolha quem vai receber." };
  if (!d.ids.length) return { ok: false, mensagem: "Nenhum usuário ativo neste público." };
  await prisma.comunicado.create({
    data: { titulo, texto, link: link || null, validoAte, publico: d.descricao, autorId: s.usuario.id, destinos: { create: d.ids.map((usuarioId) => ({ usuarioId })) } },
  });
  revalidatePath("/comunicados");
  return { ok: true, mensagem: `Mensagem enviada para ${d.ids.length} usuário${d.ids.length === 1 ? "" : "s"}.` };
}
