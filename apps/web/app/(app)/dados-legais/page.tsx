// Super Admin → Dados legais (decisão #88).
import Link from "next/link";
import { prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import FormDadosLegais from "./FormDadosLegais";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function DadosLegaisPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const c = await prisma.configLegal.findUnique({ where: { id: "config" } });
  const vazio = !c || [c.responsavel, c.documento, c.endereco, c.emailPrivacidade, c.encarregadoNome, c.encarregadoEmail, c.foro].some((x) => !x.trim());
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Configurações"
        titulo="Dados legais"
        descricao="Dados do responsável pelo FilaPro Leads que aparecem na Política de Privacidade e nos Termos de Uso."
        direita={<div className="flex gap-2"><Link href="/privacidade" target="_blank" className="btn-ghost">Ver Política</Link><Link href="/termos" target="_blank" className="btn-ghost">Ver Termos</Link></div>}
      />
      {vazio && (
        <p className="card p-3 mt-3 text-[12px]" style={{ background: "#fff7e0", color: "#8a5a00" }} data-testid="aviso-legal">
          Enquanto algum campo estiver vazio, as páginas mostram “[a preencher pelo responsável]”. Preencha antes de publicar o site e de pedir a aprovação da Meta/Google.
        </p>
      )}
      <FormDadosLegais inicial={{
        responsavel: c?.responsavel ?? "", documento: c?.documento ?? "", endereco: c?.endereco ?? "", emailPrivacidade: c?.emailPrivacidade ?? "",
        encarregadoNome: c?.encarregadoNome ?? "", encarregadoEmail: c?.encarregadoEmail ?? "", foro: c?.foro ?? "",
      }} />
      <p className="help mt-2">Os textos foram escritos seguindo a LGPD, mas recomendamos a revisão por um advogado antes de vender em escala.</p>
    </section>
  );
}
