// Status do lead (decisão #59) — rótulos e cores iguais aos da prévia.
// Arquivo sem dependências de servidor: usado também nas telas.
export const STATUS_LEAD = {
  NOVO: { rotulo: "Novo", fundo: "#eef2ff", cor: "#3730a3" },
  EM_CONVERSA: { rotulo: "Em conversa", fundo: "#fff7e0", cor: "#8a5a00" },
  QUALIFICADO: { rotulo: "Qualificado", fundo: "var(--primary-soft)", cor: "#087a44" },
  OBJECAO: { rotulo: "Objeção", fundo: "#ffeef0", cor: "#9e1d2f" },
  VENDA_CONCLUIDA: { rotulo: "Venda concluída", fundo: "#e6f8f0", cor: "#076a3d" },
  BLOQUEADO_24H: { rotulo: "Bloqueado 24h", fundo: "#f1f3f2", cor: "#5b6b62" },
  PEDIU_SAIR: { rotulo: "Pediu para sair", fundo: "#ffeef0", cor: "#9e1d2f" },
} as const;
export type StatusLeadId = keyof typeof STATUS_LEAD;
export const LISTA_STATUS = Object.keys(STATUS_LEAD) as StatusLeadId[];

/** "Pediu para sair": envio bloqueado por 45 dias (decisão #57). */
export const DIAS_BLOQUEIO_SAIR = 45;
export function fimBloqueioSair(pediuSairEm: Date) {
  return new Date(pediuSairEm.getTime() + DIAS_BLOQUEIO_SAIR * 86400000);
}
