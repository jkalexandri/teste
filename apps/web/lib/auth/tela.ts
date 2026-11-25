// Trava de cada tela (decisão #130 — falha C1 da auditoria do Módulo 4).
// A checagem do layout NÃO basta: no Next.js o layout e a página são montados em paralelo e, na navegação
// interna, o layout nem é refeito — a página era entregue a quem não podia vê-la (ex.: QR do número da plataforma).
// Por isso TODA página da área logada chama protegerTela() na primeira linha, antes de ler qualquer dado.
// A regra é a mesma do menu/layout (rotaPermitida): perfil, permissões do usuário, primeiro acesso e conta sem acesso.
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Cargo } from "@filapro/db";
import { obterSessao } from "./session";
import { motivoSemAcesso } from "./acesso";
import { rotaPermitida } from "@/lib/menu";

export async function protegerTela() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.precisaTrocar) redirect("/primeiro-acesso");
  const motivo = motivoSemAcesso(sessao);
  if (motivo) redirect(`/api/auth/encerrar?motivo=${motivo}`);
  // O caminho vem do middleware (ele sempre sobrescreve o cabeçalho; o navegador não consegue forjar)
  const caminho = (await headers()).get("x-pathname");
  if (!caminho) redirect("/login");
  const u = sessao.usuario;
  if (!rotaPermitida(u.cargo, caminho, u.cargo === Cargo.USUARIO ? u.permissoes : undefined)) redirect("/dashboard");
  return sessao;
}
