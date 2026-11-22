// Segunda etapa da entrada do Super Admin (decisão #105): código do app autenticador.
import { redirect } from "next/navigation";
import { obterSessaoPendente2fa } from "@/lib/auth/session";
import FormVerificacao from "./FormVerificacao";

export const dynamic = "force-dynamic";

export default async function VerificacaoPage() {
  const s = await obterSessaoPendente2fa();
  if (!s) redirect("/login");
  return <FormVerificacao email={s.usuario.email} />;
}
