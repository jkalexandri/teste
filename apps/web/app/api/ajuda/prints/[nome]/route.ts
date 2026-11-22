// Prints das telas usados nos manuais (decisão #101). Só para quem está logado.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth/session";
import { PASTA_MANUAIS } from "@/lib/ajuda";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const s = await obterSessao();
  if (!s) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  const { nome } = await params;
  if (!/^[a-z0-9-]+\.png$/.test(nome)) return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });
  const dados = await readFile(join(PASTA_MANUAIS, "prints", nome)).catch(() => null);
  if (!dados) return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });
  return new Response(new Uint8Array(dados), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
}
