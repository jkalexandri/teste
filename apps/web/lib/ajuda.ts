// Manuais do sistema (decisão #101). Os textos ficam em docs/manuais/*.md (também legíveis no GitHub);
// os prints das telas em docs/manuais/prints/ (gerados pelos testes).
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Marked } from "marked";
import { Cargo } from "@filapro/db";

export const PASTA_MANUAIS = join(process.cwd(), "..", "..", "docs", "manuais");

export const MANUAIS = [
  { id: "usuario", titulo: "Manual do Usuário", resumo: "Leads, campanhas, Conversas IA, WhatsApp, avisos e app no celular.", perfis: [Cargo.USUARIO, Cargo.SUPERADMIN] },
  { id: "admin-empresa", titulo: "Manual do Admin da Empresa", resumo: "Usuários, permissões, limites, leads da equipe, Empresa | IA e Logs.", perfis: [Cargo.ADMIN_EMPRESA, Cargo.SUPERADMIN] },
  { id: "super-admin", titulo: "Manual do Super Admin", resumo: "Contas, planos, pagamentos, IA, relatórios, logs, atualização e backup.", perfis: [Cargo.SUPERADMIN] },
  { id: "desenvolvedor", titulo: "Manual do Desenvolvedor", resumo: "Como o sistema é montado, publicado, testado e como mudar com segurança.", perfis: [Cargo.SUPERADMIN] },
  { id: "novidades", titulo: "Novidades (versões)", resumo: "O que mudou em cada versão do FilaPro Leads.", perfis: [Cargo.SUPERADMIN] },
] as const;
export type IdManual = (typeof MANUAIS)[number]["id"];

export function manuaisDoPerfil(cargo: Cargo) {
  return MANUAIS.filter((m) => (m.perfis as readonly Cargo[]).includes(cargo));
}

const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Lê o manual e devolve o HTML, o índice (títulos de seção) e o título. */
export async function lerManual(id: IdManual) {
  const arquivo = id === "novidades" ? "novidades.md" : `${id}.md`;
  const md = await readFile(join(PASTA_MANUAIS, arquivo), "utf8");
  const indice: { id: string; texto: string }[] = [];
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const texto = this.parser.parseInline(tokens);
        const limpo = texto.replace(/<[^>]+>/g, "");
        const id = slug(limpo);
        if (depth === 2) indice.push({ id, texto: limpo });
        return `<h${depth} id="${id}">${texto}</h${depth}>`;
      },
      image({ href, text }) {
        const src = href.startsWith("prints/") ? `/api/ajuda/${href}` : href;
        return `<figure><img src="${src}" alt="${text}" /><figcaption>${text}</figcaption></figure>`;
      },
    },
  });
  const html = await marked.parse(md);
  return { html, indice };
}
