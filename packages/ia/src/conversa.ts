// Conversas IA (etapa 10 — decisões #75 e #92): responder o lead, qualificar (Quente/Morno/Frio)
// e marcar o status numa única chamada. Para economizar, vão só a ficha (em cache), o resumo e as últimas mensagens.
import { chamarIA, type QuemUsa } from "./index";
import { ErroIA } from "./tipos";

export const TEMPERATURAS = ["QUENTE", "MORNO", "FRIO"] as const;
export type Temperatura = (typeof TEMPERATURAS)[number];
export const STATUS_IA = ["EM_CONVERSA", "QUALIFICADO", "OBJECAO"] as const;
export type StatusIA = (typeof STATUS_IA)[number];

/** Quantas mensagens recentes vão inteiras para a IA (o resto entra no resumo). */
export const MENSAGENS_RECENTES = 12;

export type MensagemConversa = { autor: "LEAD" | "IA" | "USUARIO" | "CAMPANHA"; texto: string; tipo?: string };
export type RespostaConversa = { resposta: string; temperatura: Temperatura; status: StatusIA; naoSei: boolean; motivo: string };

const SISTEMA_CONVERSA = `ATENDENTE DE WHATSAPP. Você atende, em nome da empresa, um lead que respondeu no WhatsApp. Escreva em português do Brasil,
de forma natural, curta (até 3 frases), cordial e humana, como um vendedor atencioso. Uma pergunta por vez.
Use SOMENTE as informações da ficha da empresa. Se o lead perguntar algo que não está na ficha (preço, prazo, estoque, dado específico),
NÃO invente: diga que vai confirmar a informação e retorna em seguida, e marque "naoSei": true.
Trate objeções (preço, tempo, desconfiança, "vou pensar" etc.) com empatia, usando o que o lead já revelou na conversa (o perfil dele).
Qualifique o lead:
- "QUENTE": quer comprar ou agendar agora;
- "MORNO": tem interesse, mas sem urgência;
- "FRIO": sem interesse ou só curioso.
Status: "QUALIFICADO" quando já está claro que é um lead QUENTE ou MORNO com necessidade definida; "OBJECAO" quando a última fala do lead é uma objeção;
senão "EM_CONVERSA". Não marque venda concluída. Se o lead pedir para não receber mais mensagens, responda com uma despedida educada.
Responda SOMENTE com JSON: {"resposta": "...", "temperatura": "QUENTE|MORNO|FRIO", "status": "EM_CONVERSA|QUALIFICADO|OBJECAO", "naoSei": false, "motivo": "frase curta explicando a qualificação"}.`;

const SISTEMA_RESUMO_CONVERSA = `RESUMO DA CONVERSA. Resuma a conversa de WhatsApp entre a empresa e o lead em até 120 palavras, em português:
o que o lead quer, o que já foi informado, objeções levantadas, dados que ele revelou (prazo, orçamento, preferências) e próximos passos.
Não invente nada.`;

const rotulo = (a: MensagemConversa["autor"]) => (a === "LEAD" ? "Lead" : a === "CAMPANHA" ? "Empresa (campanha)" : "Empresa");
function linha(m: MensagemConversa) {
  const extra = m.tipo && m.tipo !== "texto" ? `[${m.tipo}] ` : "";
  return `${rotulo(m.autor)}: ${extra}${m.texto}`.trim();
}

/** Extrai e valida o JSON da resposta da conversa (tolerante a texto em volta). */
export function lerJsonConversa(texto: string): RespostaConversa | null {
  const i = texto.indexOf("{"), f = texto.lastIndexOf("}");
  if (i < 0 || f <= i) return null;
  try {
    const j = JSON.parse(texto.slice(i, f + 1)) as Record<string, unknown>;
    const resposta = typeof j.resposta === "string" ? j.resposta.trim() : "";
    if (!resposta) return null;
    const t = String(j.temperatura ?? "").toUpperCase();
    const s = String(j.status ?? "").toUpperCase();
    return {
      resposta: resposta.slice(0, 1500),
      temperatura: (TEMPERATURAS as readonly string[]).includes(t) ? (t as Temperatura) : "MORNO",
      status: (STATUS_IA as readonly string[]).includes(s) ? (s as StatusIA) : "EM_CONVERSA",
      naoSei: j.naoSei === true,
      motivo: typeof j.motivo === "string" ? j.motivo.trim().slice(0, 300) : "",
    };
  } catch {
    return null;
  }
}

export async function responderConversa(
  d: {
    ficha: string; comoQualificar: string; resumo: string; recentes: MensagemConversa[]; nomeLead: string; imagem?: { tipo: string; base64: string };
    /** Lead de anúncio (decisão #84): a IA escreve a PRIMEIRA mensagem sobre o assunto do formulário */
    formularioAnuncio?: string;
  },
  quem: QuemUsa,
) {
  // Ficha e orientação de qualificação no bloco fixo (cache — decisão #75)
  const contexto = [d.ficha ? `Ficha da empresa:\n${d.ficha}` : "", d.comoQualificar ? `Como qualificar (orientação da empresa):\n${d.comoQualificar}` : ""].filter(Boolean).join("\n\n");
  const corpo = [
    d.nomeLead ? `Nome do lead: ${d.nomeLead}` : "",
    d.resumo ? `Resumo da conversa até aqui:\n${d.resumo}` : "",
    d.recentes.length ? `Últimas mensagens:\n${d.recentes.slice(-MENSAGENS_RECENTES).map(linha).join("\n")}` : "",
    d.formularioAnuncio
      ? `Este lead acabou de preencher um formulário de anúncio pedindo contato. Dados do formulário:\n${d.formularioAnuncio}\n\nEscreva a PRIMEIRA mensagem da Empresa: cumprimente pelo nome, apresente-se em nome da empresa, fale do assunto do formulário e termine com uma pergunta.`
      : "Escreva a próxima resposta da Empresa.",
  ].filter(Boolean).join("\n\n");
  const r = await chamarIA(
    "conversar",
    { sistema: SISTEMA_CONVERSA, contexto: contexto || undefined, mensagens: [{ papel: "usuario", texto: corpo, imagens: d.imagem ? [d.imagem] : undefined }], maxTokens: 600 },
    quem,
  );
  const j = lerJsonConversa(r.texto);
  if (!j) throw new ErroIA("A IA respondeu num formato inesperado.");
  return { ...j, custoUsd: r.custoUsd };
}

/** Atualiza o resumo da conversa com as mensagens que saíram da janela recente. */
export async function resumirConversa(resumoAtual: string, mensagens: MensagemConversa[], quem: QuemUsa) {
  const texto = [resumoAtual ? `Resumo anterior:\n${resumoAtual}` : "", `Mensagens novas:\n${mensagens.map(linha).join("\n")}`].filter(Boolean).join("\n\n");
  const r = await chamarIA("conversar", { sistema: SISTEMA_RESUMO_CONVERSA, mensagens: [{ papel: "usuario", texto: texto.slice(0, 30_000) }], maxTokens: 300 }, quem);
  return r.texto.trim().slice(0, 2000);
}
