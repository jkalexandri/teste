// GET /api/logos/<logo>.<png|svg>[?baixar=1] — logos da marca, só para o Super Admin (decisão #97).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { FORMATOS, LOGOS } from "@/lib/logos";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || s.usuario.cargo !== Cargo.SUPERADMIN) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  const { arquivo } = await params;
  const m = /^([a-z-]+)\.(png|svg)$/.exec(arquivo);
  if (!m || !LOGOS.some((l) => l.id === m[1])) return NextResponse.json({ erro: "Logo não encontrada." }, { status: 404 });
  const dados = await readFile(join(process.cwd(), "assets", "logos", arquivo));
  const baixar = new URL(req.url).searchParams.get("baixar") === "1";
  return new Response(new Uint8Array(dados), {
    headers: {
      "content-type": FORMATOS[m[2] as keyof typeof FORMATOS],
      "cache-control": "private, max-age=3600",
      ...(baixar ? { "content-disposition": `attachment; filename="${arquivo}"` } : {}),
    },
  });
}
