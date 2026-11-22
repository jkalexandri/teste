// Logos (decisão #97): o Super Admin baixa as logos da marca, sem fundo, em PNG (alta resolução) e SVG.
import { redirect } from "next/navigation";
import { Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import { LOGOS } from "@/lib/logos";

export const dynamic = "force-dynamic";

const XADREZ = {
  backgroundColor: "#fff",
  backgroundImage: "linear-gradient(45deg,#e3e6e4 25%,transparent 25%,transparent 75%,#e3e6e4 75%),linear-gradient(45deg,#e3e6e4 25%,transparent 25%,transparent 75%,#e3e6e4 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0,9px 9px",
};

export default async function LogosPage() {
  const s = await obterSessao();
  if (!s || s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Super Admin • Configurações" titulo="Logos" descricao="Logos do FilaPro Leads sem fundo. PNG em alta resolução (fundo transparente) e SVG (pode aumentar sem perder qualidade)." />
      <div className="grid xl:grid-cols-3 gap-3 mt-3">
        {LOGOS.map((l) => (
          <div key={l.id} className="card p-4 flex flex-col gap-3" data-testid="logo">
            <div>
              <h2 className="font-display font-extrabold text-[15px]">{l.nome}</h2>
              <p className="help">{l.dica}</p>
            </div>
            <div className="rounded-xl p-4 flex items-center justify-center" style={XADREZ}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/logos/${l.id}.svg`} alt={l.nome} className="max-w-full h-auto" style={{ maxHeight: 90 }} />
            </div>
            <div className="flex gap-2 mt-auto">
              <a className="btn-primary flex-1 justify-center" href={`/api/logos/${l.id}.png?baixar=1`} download>Baixar PNG</a>
              <a className="btn-ghost flex-1 justify-center" href={`/api/logos/${l.id}.svg?baixar=1`} download>Baixar SVG</a>
            </div>
          </div>
        ))}
      </div>
      <p className="help mt-2">O fundo quadriculado só mostra que a imagem é transparente; ele não vai no arquivo.</p>
    </section>
  );
}
