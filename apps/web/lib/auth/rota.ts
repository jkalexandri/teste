// Sessão das rotas da API (decisão #162 — S3 do Módulo 1): a mesma regra das telas.
// Só devolve a sessão se ela é válida, não está em "primeiro acesso" (senha temporária ainda não trocada) e a conta
// tem acesso (usuário não bloqueado, empresa ativa e plano em dia). Senão, null: a rota responde "Acesso negado".
import "server-only";
import { obterSessao } from "./session";
import { motivoSemAcesso } from "./acesso";

export async function sessaoDaRota() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) return null;
  return s;
}
