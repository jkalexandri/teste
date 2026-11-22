// Resumo do treinamento da IA de uma conta (decisão #77) para as telas do Super Admin.
import type { TreinoIA } from "@/components/app/ControleTreinoIA";

export const INCLUIR_FICHA = { ficha: { select: { mesRef: true, paginasMes: true, materiaisPeriodo: true } } } as const;

export function treinoDaConta(e: {
  treinarIA: boolean; limiteMateriais: number | null; limitePaginasMes: number | null;
  ficha: { mesRef: string; paginasMes: number; materiaisPeriodo: number } | null;
}): TreinoIA {
  const mes = new Date().toISOString().slice(0, 7);
  return {
    treinarIA: e.treinarIA,
    limiteMateriais: e.limiteMateriais,
    limitePaginasMes: e.limitePaginasMes,
    materiais: e.ficha?.materiaisPeriodo ?? 0,
    paginasMes: e.ficha?.mesRef === mes ? e.ficha.paginasMes : 0,
  };
}
