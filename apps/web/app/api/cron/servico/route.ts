// GET /api/cron/servico — roda a cada 5 minutos (agendador da VPS: deploy/vigia-servico.sh — decisão #151).
// Avisa os Super Admins por e-mail quando o serviço 24/7 fica fora do ar (e quando volta). Protegido por CRON_SECRET.
import { NextResponse } from "next/server";
import { conferirServico } from "@/lib/alerta-servico";
import { prisma } from "@filapro/db";
import { limparTentativasVelhas } from "@/lib/auth/tentativas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  // Limpeza (decisão #158): sessões vencidas há mais de 1 dia não servem para nada (só o hash do token fica guardado)
  const limpas = await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date(Date.now() - 24 * 3600_000) } } }).then((r) => r.count).catch(() => 0);
  const tentativasLimpas = await limparTentativasVelhas().catch(() => 0); // linhas de controle de login/recuperação com mais de 1 dia
  return NextResponse.json({ ...(await conferirServico()), sessoesLimpas: limpas, tentativasLimpas });
}
