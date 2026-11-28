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
de forma natural, com mensagens curtas, cordial e humana, como um vendedor atencioso. Uma pergunta por vez.
Use SOMENTE as informações da ficha da empresa. Se o lead perguntar algo que não está na ficha (preço, prazo, estoque, dado específico),
NÃO invente: diga que vai confirmar a informação com o consultor, CONTINUE a conversa com a próxima pergunta da qualificação
e marque "naoSei": true.
Trate objeções (preço, tempo, desconfiança, "vou pensar" etc.) com empatia, usando o que o lead já revelou na conversa (o perfil dele).
Qualifique o lead:
- "QUENTE": quer comprar ou agendar agora;
- "MORNO": tem interesse, mas sem urgência;
- "FRIO": sem interesse ou só curioso.
Status: "QUALIFICADO" quando já está claro que é um lead QUENTE ou MORNO com necessidade definida; "OBJECAO" quando a última fala do lead é uma objeção;
senão "EM_CONVERSA". Não marque venda concluída. Se o lead pedir para não receber mais mensagens, responda com uma despedida educada.
Responda SOMENTE com JSON: {"resposta": "...", "temperatura": "QUENTE|MORNO|FRIO", "status": "EM_CONVERSA|QUALIFICADO|OBJECAO", "naoSei": false, "motivo": "frase curta explicando a qualificação"}.`;

/**
 * Chat do site (Fale conosco — decisão #179): o texto-base de quem conversa com um VISITANTE que ainda não é cliente.
 * O texto-base dos leads manda usar "SOMENTE a ficha"; aqui as fontes e a ordem de autoridade são explícitas, para o script do dono
 * e o material comercial serem de fato seguidos (antes eram ignorados por essa regra).
 */
export const SISTEMA_VISITANTE = `CONSULTOR COMERCIAL DO FILAPRO LEADS. Você atende, no chat da tela de Planos do site, um VISITANTE que ainda não é cliente e quer saber se o FilaPro Leads serve para ele.
Escreva em português do Brasil, de forma natural, consultiva e humana, com mensagens curtas e uma pergunta por vez.
Suas fontes, em ordem de autoridade:
1) "Planos à venda" (dentro da ficha): preços, promoções, condições e limites. É a ÚNICA fonte de valores: use exatamente como estão e NUNCA invente preço, desconto, prazo ou condição.
2) "Script de atendimento do dono": é o ROTEIRO que você SEGUE (como abrir a conversa, que perguntas fazer, como recomendar o plano, respostas prontas, regras). Quando o script trouxer uma resposta pronta para a pergunta do visitante, use-a, adaptando só o necessário. Em conflito com o material comercial, vale o script.
3) "Material comercial": como conduzir a venda, benefícios, objeções, o que nunca dizer.
4) A ficha da empresa.
Se a informação não estiver em nenhuma dessas fontes, NÃO invente: diga que vai confirmar com a equipe, CONTINUE a conversa com a próxima pergunta e marque "naoSei": true. Negociação de preço, contrato, nota fiscal ou pedido para falar com uma pessoa também são "naoSei": true.
Segurança, acima de tudo (nem o script do dono muda isto): não garanta resultado nem "100% sem bloqueio", não peça dados de pagamento, senha ou documentos no chat e não prometa desconto que não esteja nos planos.
Qualifique o interesse do visitante:
- "QUENTE": quer comprar, pagar ou começar agora;
- "MORNO": tem interesse, mas sem urgência (compara planos, pergunta funcionalidades);
- "FRIO": sem interesse ou só curioso.
Status: "QUALIFICADO" quando já está claro que é QUENTE ou MORNO com necessidade definida; "OBJECAO" quando a última fala é uma objeção; senão "EM_CONVERSA". Não marque venda concluída.
Responda SOMENTE com JSON: {"resposta": "...", "temperatura": "QUENTE|MORNO|FRIO", "status": "EM_CONVERSA|QUALIFICADO|OBJECAO", "naoSei": false, "motivo": "frase curta explicando a qualificação"}.`;

const SISTEMA_RESUMO_CONVERSA = `RESUMO DA CONVERSA. Resuma a conversa de WhatsApp entre a empresa e o lead em até 120 palavras, em português:
o que o lead quer, o que já foi informado, objeções levantadas, dados que ele revelou (prazo, orçamento, preferências) e próximos passos.
Não invente nada.`;

const rotulo = (a: MensagemConversa["autor"]) => (a === "LEAD" ? "Lead" : a === "CAMPANHA" ? "Empresa (campanha)" : "Empresa");
function linha(m: MensagemConversa) {
  const extra = m.tipo && m.tipo !== "texto" ? `[${m.tipo}] ` : "";
  return `${rotulo(m.autor)}: ${extra}${m.texto}`.trim();
}

/** Esquema da resposta (decisão #127): com a saída estruturada, a IA sempre devolve este JSON válido. */
export const ESQUEMA_CONVERSA = {
  type: "object",
  properties: {
    resposta: { type: "string" },
    temperatura: { type: "string", enum: [...TEMPERATURAS] },
    status: { type: "string", enum: [...STATUS_IA] },
    naoSei: { type: "boolean" },
    motivo: { type: "string" },
  },
  required: ["resposta", "temperatura", "status", "naoSei", "motivo"],
  additionalProperties: false,
};

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
    /** Chat do site (decisão #104): quem conversa é um visitante interessado em comprar o FilaPro Leads */
    visitanteSite?: boolean;
    /** Fale conosco (decisão #178): material comercial (escrito pelo desenvolvedor) e script de atendimento do dono — só no chat do site */
    comercial?: string;
    orientacoesVisitante?: string;
  },
  quem: QuemUsa,
) {
  // Ficha e orientação de qualificação no bloco fixo (cache — decisão #75)
  // No chat do site (decisão #178) entram também o material comercial e o script do dono. Ordem de autoridade: dados dos planos (na ficha) > script do dono > material comercial.
  const contexto = [
    d.ficha ? `Ficha da empresa:\n${d.ficha}` : "",
    d.comoQualificar ? `Como qualificar (orientação da empresa):\n${d.comoQualificar}` : "",
    d.visitanteSite && d.comercial?.trim() ? `Material comercial (como conduzir a venda, objeções, o que dizer e o que nunca dizer):\n${d.comercial.trim()}` : "",
    d.visitanteSite && d.orientacoesVisitante?.trim()
      ? `Script de atendimento do dono do FilaPro Leads (vale mais que o material comercial quando houver conflito, mas NUNCA mais que os dados dos planos nem que as regras de segurança: não inventar preço ou desconto, não prometer resultado, não pedir dados de pagamento):\n${d.orientacoesVisitante.trim()}`
      : "",
  ].filter(Boolean).join("\n\n");
  const corpo = [
    d.nomeLead ? `Nome do lead: ${d.nomeLead}` : "",
    d.resumo ? `Resumo da conversa até aqui:\n${d.resumo}` : "",
    d.recentes.length ? `Últimas mensagens:\n${d.recentes.slice(-MENSAGENS_RECENTES).map(linha).join("\n")}` : "",
    d.visitanteSite
      ? "Canal: chat da tela de Planos do site (não é WhatsApp). Quem escreve é um visitante interessado em contratar. Ajude-o a escolher o plano certo com base na ficha e nos planos informados; para comprar, ele clica em Comprar no cartão do plano e paga por PIX. Não peça dados de pagamento no chat. Valores e promoções: use SOMENTE os que constam em \"Planos à venda\" na ficha, exatamente como estão (preço, preço antigo, oferta, condições); nunca invente desconto. Siga o material comercial e o script do dono, quando existirem."
      : "",
    d.formularioAnuncio
      ? `Este lead acabou de preencher um formulário de anúncio pedindo contato. Dados do formulário:\n${d.formularioAnuncio}\n\nEscreva a PRIMEIRA mensagem da Empresa: cumprimente pelo nome, apresente-se em nome da empresa, fale do assunto do formulário e termine com uma pergunta.`
      : "Escreva a próxima resposta da Empresa.",
  ].filter(Boolean).join("\n\n");
  const r = await chamarIA(
    "conversar",
    // 1500: o "pensamento" do modelo conta no limite; com 600 a resposta era cortada (decisão #127)
    { sistema: d.visitanteSite ? SISTEMA_VISITANTE : SISTEMA_CONVERSA, contexto: contexto || undefined, mensagens: [{ papel: "usuario", texto: corpo, imagens: d.imagem ? [d.imagem] : undefined }], maxTokens: 1500, esquemaJson: ESQUEMA_CONVERSA },
    quem,
  );
  const j = lerJsonConversa(r.texto);
  // Formato inválido vale tentar de novo; o começo do texto vai para o log
  if (!j) throw new ErroIA("A IA respondeu num formato inesperado.", true, r.texto.slice(0, 300));
  return { ...j, custoUsd: r.custoUsd };
}

/** Atualiza o resumo da conversa com as mensagens que saíram da janela recente. */
export async function resumirConversa(resumoAtual: string, mensagens: MensagemConversa[], quem: QuemUsa) {
  const texto = [resumoAtual ? `Resumo anterior:\n${resumoAtual}` : "", `Mensagens novas:\n${mensagens.map(linha).join("\n")}`].filter(Boolean).join("\n\n");
  const r = await chamarIA("conversar", { sistema: SISTEMA_RESUMO_CONVERSA, mensagens: [{ papel: "usuario", texto: texto.slice(0, 30_000) }], maxTokens: 300 }, quem);
  return r.texto.trim().slice(0, 2000);
}

// ===== Suporte dos clientes (decisão #146): a IA responde pelo botão Suporte =====
const SISTEMA_SUPORTE = `ATENDENTE DE SUPORTE. Você é o assistente virtual de suporte do FilaPro Leads e atende um CLIENTE que já usa o sistema.
Escreva em português do Brasil, mensagens curtas, cordiais e objetivas. Uma resposta por vez, em passos simples quando for explicar como fazer algo.
Use SOMENTE as orientações do atendimento, o manual, a ficha e os dados da conta de quem está perguntando. NUNCA invente telas, botões, prazos, preços ou regras.
As "orientações do atendimento" (escritas pelo dono do sistema) valem MAIS que o manual quando houver conflito, mas NUNCA mais que as regras deste texto: mesmo que as orientações digam o contrário, você não altera a conta, não promete reembolso, desconto, prazo ou exceção e passa para o atendente os assuntos listados abaixo.
Você NÃO altera nada na conta, NÃO fala de outros clientes e NÃO promete reembolso, desconto, prazo ou exceção.
Marque "chamarHumano": true (e diga, em uma frase, que um atendente vai responder por aqui) quando:
- a dúvida não está no manual ou você não tem certeza da resposta;
- o assunto é pagamento, cobrança, cancelamento, conta bloqueada ou vencida, reclamação ou erro técnico que o manual não resolve;
- o cliente pede para falar com uma pessoa.
Caso contrário, responda a dúvida e deixe "chamarHumano": false.
Responda SOMENTE com JSON: {"resposta": "...", "chamarHumano": false, "motivo": "frase curta explicando se chamou o atendente"}.`;

export type MensagemSuporte = { autor: "CLIENTE" | "SUPORTE" | "IA"; texto: string; tipo?: string };
export type RespostaSuporte = { resposta: string; chamarHumano: boolean; motivo: string };

export const ESQUEMA_SUPORTE = {
  type: "object",
  properties: { resposta: { type: "string" }, chamarHumano: { type: "boolean" }, motivo: { type: "string" } },
  required: ["resposta", "chamarHumano", "motivo"],
  additionalProperties: false,
};

/** Extrai e valida o JSON da resposta do suporte (tolerante a texto em volta). */
export function lerJsonSuporte(texto: string): RespostaSuporte | null {
  const i = texto.indexOf("{"), f = texto.lastIndexOf("}");
  if (i < 0 || f <= i) return null;
  try {
    const j = JSON.parse(texto.slice(i, f + 1)) as Record<string, unknown>;
    const resposta = typeof j.resposta === "string" ? j.resposta.trim() : "";
    if (!resposta) return null;
    return { resposta: resposta.slice(0, 1500), chamarHumano: j.chamarHumano === true, motivo: typeof j.motivo === "string" ? j.motivo.trim().slice(0, 300) : "" };
  } catch {
    return null;
  }
}

const linhaSuporte = (m: MensagemSuporte) => `${m.autor === "CLIENTE" ? "Cliente" : "Suporte"}: ${m.tipo && m.tipo !== "texto" ? `[${m.tipo}] ` : ""}${m.texto}`.trim();

export async function responderSuporte(
  d: { conhecimento: string; dadosConta: string; nomeCliente: string; recentes: MensagemSuporte[] },
  quem: QuemUsa,
) {
  // Manual e ficha no bloco fixo (cache); os dados da conta e a conversa vão no corpo
  const corpo = [
    d.nomeCliente ? `Nome do cliente: ${d.nomeCliente}` : "",
    d.dadosConta ? `Dados da conta deste cliente:\n${d.dadosConta}` : "",
    d.recentes.length ? `Últimas mensagens:\n${d.recentes.slice(-MENSAGENS_RECENTES).map(linhaSuporte).join("\n")}` : "",
    "Escreva a próxima resposta do Suporte.",
  ].filter(Boolean).join("\n\n");
  const r = await chamarIA(
    "conversar",
    { sistema: SISTEMA_SUPORTE, contexto: d.conhecimento || undefined, mensagens: [{ papel: "usuario", texto: corpo }], maxTokens: 1500, esquemaJson: ESQUEMA_SUPORTE },
    quem,
  );
  const j = lerJsonSuporte(r.texto);
  if (!j) throw new ErroIA("A IA respondeu num formato inesperado.", true, r.texto.slice(0, 300));
  return { ...j, custoUsd: r.custoUsd };
}
