// Dados do responsável usados na Política de Privacidade e nos Termos (decisão #88).
// Campos vazios aparecem como "[a preencher]" — nada é inventado.
import "server-only";
import { prisma } from "@filapro/db";

export const ATUALIZADO_EM = "22 de novembro de 2026";
const VAZIO = "[a preencher pelo responsável]";

export async function dadosLegais() {
  const c = await prisma.configLegal.findUnique({ where: { id: "config" } });
  const v = (x?: string | null) => (x && x.trim() ? x.trim() : VAZIO);
  const completo = !!c && [c.responsavel, c.documento, c.endereco, c.emailPrivacidade, c.encarregadoNome, c.encarregadoEmail, c.foro].every((x) => x.trim());
  return {
    responsavel: v(c?.responsavel),
    documento: v(c?.documento),
    endereco: v(c?.endereco),
    emailPrivacidade: v(c?.emailPrivacidade),
    encarregadoNome: v(c?.encarregadoNome),
    encarregadoEmail: v(c?.encarregadoEmail),
    foro: v(c?.foro),
    completo,
  };
}
