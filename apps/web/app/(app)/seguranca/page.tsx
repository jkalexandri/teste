// Segurança (decisões #105 e #166): verificação em duas etapas, opcional, para todos os perfis.
import { redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import DoisFatores from "./DoisFatores";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function SegurancaPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Sistema • Segurança" titulo="Segurança" descricao="Proteja a sua conta com a verificação em duas etapas: além da senha, um código do app autenticador do seu celular." />
      <div className="card p-4 mt-3 max-w-[720px]">
        <DoisFatores ativo={s.usuario.doisFatoresAtivo} restantes={s.usuario.doisFatoresCodigos.length} />
      </div>
    </section>
  );
}
