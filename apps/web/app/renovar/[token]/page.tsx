// Página do link de renovação enviado por e-mail (decisões #42 e #43).
// Pública: o token do link identifica a conta. O cliente pode trocar de plano.
import { prisma } from "@filapro/db";
import RenovarCliente from "./RenovarCliente";

export const dynamic = "force-dynamic";

export default async function RenovarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const empresa = await prisma.empresa.findUnique({ where: { tokenRenovacao: token } });
  const planos = empresa
    ? await prisma.plano.findMany({
        where: { visivel: true, gratis: false, personalizado: false, modulo: empresa.modulo, precoAtual: { not: null } },
        orderBy: { ordem: "asc" },
      })
    : [];

  return (
    <div className="login-future min-h-[100dvh] flex items-start sm:items-center justify-center p-3 py-8">
      <div className="relative z-[1] w-full max-w-[1320px]">
        <div className="font-display font-extrabold text-[26px] leading-none mb-4 text-center">
          <span className="login-neon-text">FilaPro Leads</span><span style={{ color: "#25D366" }}>.</span>
        </div>
        {!empresa ? (
          <div className="login-glass rounded-[18px] p-5 max-w-[480px] mx-auto text-[13px] text-slate-300">
            Este link de renovação é inválido ou já foi utilizado. Entre em{" "}
            <a href="/login" className="font-bold text-cyan-300">filaproleads.com.br</a> e use o botão “Planos” com o seu e-mail de acesso.
          </div>
        ) : (
          <RenovarCliente
            token={token}
            conta={{
              nome: empresa.nome,
              pacote: empresa.pacote,
              planoId: empresa.planoId,
              expiraEm: empresa.expiraEm.toISOString(),
            }}
            planos={planos.map(({ criadoEm, atualizadoEm, ...p }) => p)}
          />
        )}
      </div>
    </div>
  );
}
