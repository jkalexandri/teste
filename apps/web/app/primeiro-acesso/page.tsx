// Primeiro acesso: troca obrigatória da senha temporária (decisão #12).
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/session";
import TrocarSenhaForm from "./TrocarSenhaForm";

export const dynamic = "force-dynamic";

export default async function PrimeiroAcessoPage() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (!sessao.precisaTrocar) redirect("/dashboard");
  return <TrocarSenhaForm nome={sessao.usuario.nome} email={sessao.usuario.email} />;
}
