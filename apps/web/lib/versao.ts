// Versão do sistema (decisão #100): definida no package.json da raiz e gravada na montagem do site.
export const VERSAO = process.env.NEXT_PUBLIC_VERSAO || "0.0.0";
export const VERSAO_DATA = process.env.NEXT_PUBLIC_VERSAO_DATA || "";
/** Ex.: "v1.26.0" */
export const VERSAO_CURTA = `v${VERSAO}`;
