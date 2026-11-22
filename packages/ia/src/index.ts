// Camada de IA do FilaPro Leads (etapa 9a — decisões #72, #75 e #77).
// Toda chamada passa por aqui: escolhe o provedor/modelo da tarefa (menu do Super Admin),
// chama o conector, calcula o custo e registra o uso (tela de despesas).
import { prisma } from "@filapro/db";
import { conectorAnthropic } from "./conectores/anthropic";
import { conectorCompativel } from "./conectores/compativel";
import { conectorSimulado } from "./conectores/simulado";
import { descriptografar } from "./cripto";
import { custoUsd, PADRAO } from "./precos";
import { ErroIA, type Conector, type PedidoIA, type Provedor, type RespostaIA, type Tarefa } from "./tipos";

export * from "./tipos";
export * from "./precos";
export { criptografar } from "./cripto";

const CONECTORES: Record<Provedor, Conector> = { anthropic: conectorAnthropic, compativel: conectorCompativel, simulado: conectorSimulado };

export type ConfigTarefa = { tarefa: string; provedor: string; modelo: string; urlBase: string; chave: string | null; precoEntrada: number; precoSaida: number };

/** Configuração da tarefa (ou o padrão: Claude Haiku 5.5). */
/** Registro especial que guarda a chave única da Anthropic (decisão #78). */
export const CHAVE_GLOBAL = "_anthropic";

export async function configDaTarefa(tarefa: Tarefa): Promise<ConfigTarefa> {
  const [c, global] = await Promise.all([prisma.configIA.findUnique({ where: { tarefa } }), prisma.configIA.findUnique({ where: { tarefa: CHAVE_GLOBAL } })]);
  const cfg: ConfigTarefa = c
    ? { tarefa: c.tarefa, provedor: c.provedor, modelo: c.modelo, urlBase: c.urlBase, chave: c.chave, precoEntrada: c.precoEntrada, precoSaida: c.precoSaida }
    : { tarefa, provedor: PADRAO.provedor, modelo: PADRAO.modelo, urlBase: "", chave: null, precoEntrada: PADRAO.entrada, precoSaida: PADRAO.saida };
  // Sem chave própria, a tarefa que usa o Claude usa a chave única
  if (cfg.provedor === "anthropic" && !cfg.chave && global?.chave) cfg.chave = global.chave;
  return cfg;
}

export type QuemUsa = { empresaId?: string | null; usuarioId?: string | null };

/**
 * Chama a IA da tarefa e registra o uso. Lança ErroIA com mensagem clara se algo falhar
 * (e registra a falha com custo zero, para o Super Admin ver).
 * `configTeste` permite o botão "Testar" do menu usar uma configuração ainda não salva.
 */
export async function chamarIA(tarefa: Tarefa, pedido: PedidoIA, quem: QuemUsa, configTeste?: ConfigTarefa): Promise<RespostaIA & { custoUsd: number }> {
  const cfg = configTeste ?? (await configDaTarefa(tarefa));
  const provedor = cfg.provedor as Provedor;
  if (provedor === "simulado" && process.env.NEXT_PUBLIC_APP_ENV === "production") throw new ErroIA("IA simulada não pode ser usada em produção.");
  const conector = CONECTORES[provedor];
  if (!conector) throw new ErroIA(`Provedor de IA desconhecido: ${cfg.provedor}`);
  let chave: string | null = null;
  if (cfg.chave) {
    try { chave = configTeste && !cfg.chave.startsWith("v1:") ? cfg.chave : descriptografar(cfg.chave); } catch { throw new ErroIA("Não foi possível ler a chave salva. Salve a chave de novo no menu."); }
  }
  const registro = { tarefa, provedor: cfg.provedor, modelo: cfg.modelo, empresaId: quem.empresaId ?? null, usuarioId: quem.usuarioId ?? null };
  try {
    const r = await conector.chamar({ provedor, modelo: cfg.modelo, urlBase: cfg.urlBase, chave }, pedido);
    const custo = custoUsd(r.uso, { entrada: cfg.precoEntrada, saida: cfg.precoSaida });
    await prisma.usoIA.create({ data: { ...registro, ...r.uso, custoUsd: custo } });
    return { ...r, custoUsd: custo };
  } catch (e) {
    const msg = e instanceof ErroIA ? e.message : "Falha inesperada na IA.";
    await prisma.usoIA.create({ data: { ...registro, ok: false, erro: msg.slice(0, 300) } }).catch(() => undefined);
    throw e instanceof ErroIA ? e : new ErroIA(msg);
  }
}

// ===================== Gerar mensagens (principal + 3 variações numa chamada) =====================

const SISTEMA_MENSAGENS = `Você escreve mensagens de prospecção para WhatsApp, em português do Brasil.
A partir da "Mensagem de Referência" do usuário, escreva:
- "principal": a mensagem principal, curta (até 400 caracteres), natural e humana, com a mesma intenção da referência;
- "variacoes": 3 versões diferentes da principal (mesma ideia, outras palavras e outra ordem), para o envio não parecer repetido.
Regras: use {nome} onde entraria o primeiro nome do lead; pode começar com {saudacao} (vira "Oi", "Olá" ou "Bom dia/Boa tarde/Boa noite");
não invente preços, datas, promoções ou dados que não estejam na referência ou na ficha da empresa; não use links que não estejam na referência;
termine com uma pergunta simples que convide a responder.
Responda SOMENTE com JSON no formato {"principal": "...", "variacoes": ["...", "...", "..."]}.`;

/** Extrai o JSON da resposta (tolerante a texto em volta). */
export function lerJsonMensagens(texto: string): { principal: string; variacoes: string[] } | null {
  const i = texto.indexOf("{"), f = texto.lastIndexOf("}");
  if (i < 0 || f <= i) return null;
  try {
    const j = JSON.parse(texto.slice(i, f + 1)) as { principal?: unknown; variacoes?: unknown };
    if (typeof j.principal !== "string" || !j.principal.trim()) return null;
    const variacoes = Array.isArray(j.variacoes) ? j.variacoes.filter((v): v is string => typeof v === "string" && !!v.trim()).slice(0, 3) : [];
    return { principal: j.principal.trim(), variacoes: variacoes.map((v) => v.trim()) };
  } catch {
    return null;
  }
}

export async function gerarMensagens(referencia: string, fichaEmpresa: string, quem: QuemUsa) {
  // A ficha resumida vai no bloco fixo (cache) — decisão #75
  const r = await chamarIA(
    "gerar_mensagens",
    {
      sistema: SISTEMA_MENSAGENS,
      contexto: fichaEmpresa ? `Ficha da empresa (use só para dar contexto, sem inventar):\n${fichaEmpresa}` : undefined,
      mensagens: [{ papel: "usuario", texto: `Mensagem de Referência:\n${referencia}` }],
      maxTokens: 1500,
    },
    quem,
  );
  const m = lerJsonMensagens(r.texto);
  if (!m) throw new ErroIA("A IA respondeu num formato inesperado. Tente de novo.");
  return { ...m, custoUsd: r.custoUsd };
}

/** Teste rápido do menu: uma pergunta curta com a configuração informada. */
export async function testarConfig(tarefa: Tarefa, cfg: ConfigTarefa) {
  const r = await chamarIA(tarefa, { sistema: "Responda em português, numa frase curta.", mensagens: [{ papel: "usuario", texto: "Diga 'Conexão OK' e o seu nome de modelo." }], maxTokens: 200 }, {}, cfg);
  return { texto: r.texto, custoUsd: r.custoUsd, modelo: r.modelo };
}

// ===================== Empresa | IA (etapa 9b — decisões #74, #75 e #77) =====================

/** Tamanho máximo da ficha (≈3 páginas): o material não aumenta o custo das conversas. */
export const MAX_TOKENS_FICHA = 2500;
const SISTEMA_RESUMO = `RESUMO DO MATERIAL. Você ajuda a montar o conhecimento de uma empresa para um atendente de WhatsApp.
Leia o material e escreva, em português, um resumo objetivo (até 350 palavras) só com fatos úteis para vender e atender:
produtos/serviços, preços e condições (se houver), diferenciais, público, horários, endereço, contatos, perguntas frequentes.
Se for imagem, transcreva os textos importantes e descreva o que aparece. Não invente nada que não esteja no material.`;
const SISTEMA_FICHA = `FICHA DA EMPRESA. Monte a ficha que um atendente de WhatsApp vai usar, em português, organizada em tópicos curtos
(Sobre a empresa; Produtos e serviços; Preços e condições; Diferenciais; Atendimento e contatos; Perguntas frequentes).
Use somente as informações recebidas, sem inventar. Seja compacto: no máximo cerca de 1.500 palavras.`;

/** Resume um material (texto ou imagem). Conta o uso para a conta. */
export async function resumirMaterial(material: { texto?: string; imagem?: { tipo: string; base64: string } }, quem: QuemUsa) {
  const r = await chamarIA(
    "aprender",
    {
      sistema: SISTEMA_RESUMO,
      mensagens: [{ papel: "usuario", texto: material.texto ? `Material:\n${material.texto.slice(0, 60_000)}` : "Leia esta imagem.", imagens: material.imagem ? [material.imagem] : undefined }],
      maxTokens: 700,
    },
    quem,
  );
  return r.texto;
}

/** Monta a ficha compacta a partir dos campos e dos resumos dos materiais. */
export async function montarFicha(campos: { nome: string; endereco: string; telefone: string; whatsapp: string; atividade: string }, resumos: string[], quem: QuemUsa) {
  const dados = [
    `Nome da empresa: ${campos.nome || "-"}`, `Endereço: ${campos.endereco || "-"}`, `Telefone: ${campos.telefone || "-"}`,
    `WhatsApp: ${campos.whatsapp || "-"}`, `Atividade: ${campos.atividade || "-"}`,
    ...resumos.map((r, i) => `\n--- Material ${i + 1} ---\n${r}`),
  ].join("\n");
  const r = await chamarIA("aprender", { sistema: SISTEMA_FICHA, mensagens: [{ papel: "usuario", texto: dados.slice(0, 80_000) }], maxTokens: MAX_TOKENS_FICHA }, quem);
  return r.texto;
}
export * from "./conversa";
