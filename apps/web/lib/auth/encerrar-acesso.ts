// Encerra o acesso de contas barradas (decisão #158 — S2b da auditoria do Módulo 1).
// Apaga as sessões abertas e os aparelhos de notificação (celular). Assim, se a conta voltar em seguida,
// nenhuma sessão antiga "ressuscita" e nenhum aparelho continua recebendo avisos de uma conta barrada.
import { prisma } from "@filapro/db";

type Cliente = Pick<typeof prisma, "sessao" | "pushInscricao" | "usuario">;

/** Encerra sessões e notificações dos usuários indicados. */
export async function encerrarAcessoDeUsuarios(ids: string[], c: Cliente = prisma) {
  if (!ids.length) return;
  await c.sessao.deleteMany({ where: { usuarioId: { in: ids } } });
  await c.pushInscricao.deleteMany({ where: { usuarioId: { in: ids } } });
}

/** Encerra sessões e notificações de todos os usuários da empresa. */
export async function encerrarAcessoDaEmpresa(empresaId: string, c: Cliente = prisma) {
  const ids = (await c.usuario.findMany({ where: { empresaId }, select: { id: true } })).map((u) => u.id);
  await encerrarAcessoDeUsuarios(ids, c);
}
