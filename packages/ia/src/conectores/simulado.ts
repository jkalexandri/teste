// IA simulada: respostas fixas, sem custo. Só para testes fora de produção.
import type { Conector, PedidoIA, RespostaIA } from "../tipos";

export const conectorSimulado: Conector = {
  async chamar(_cfg, p: PedidoIA): Promise<RespostaIA> {
    const ultimo = p.mensagens.at(-1)?.texto ?? "";
    // Para a geração de mensagens devolve o JSON esperado
    const texto = /ATENDENTE DE SUPORTE/.test(p.sistema)
      ? suporteSimulado(ultimo)
      : /ATENDENTE DE WHATSAPP/.test(p.sistema)
      ? conversaSimulada(ultimo)
      : /RESUMO DA CONVERSA/.test(p.sistema)
        ? `Resumo simulado da conversa: ${ultimo.replace(/\s+/g, " ").slice(-200)}`
        : /"principal"/.test(p.sistema)
      ? JSON.stringify({
          principal: "{saudacao} {nome}, tudo bem? Vi que você pode se interessar pela nossa novidade. Posso te contar em 1 minuto?",
          variacoes: [
            "Oi {nome}! Tenho uma novidade que pode te ajudar. Posso explicar rapidinho?",
            "{saudacao} {nome}! Separei uma informação útil para você. Quer saber mais?",
            "Olá {nome}, tudo certo? Posso te mostrar uma oportunidade em poucos minutos?",
          ],
        })
      : /FICHA DA EMPRESA/.test(p.sistema)
        ? `Ficha simulada: ${ultimo.replace(/\s+/g, " ").slice(0, 300)}`
        : /RESUMO DO MATERIAL/.test(p.sistema)
          ? `Resumo simulado: ${p.mensagens.at(-1)?.imagens?.length ? "imagem com texto e produtos" : ultimo.replace(/\s+/g, " ").slice(0, 200)}`
          : `Resposta simulada para: ${ultimo.slice(0, 80)}`;
    return { texto, modelo: "simulado", uso: { entrada: Math.ceil((p.sistema.length + ultimo.length) / 4), saida: Math.ceil(texto.length / 4), cacheLeitura: 0, cacheEscrita: 0 } };
  },
};

/** Conversa simulada (testes): reage à última fala do lead com regras fixas. */
function conversaSimulada(pedido: string) {
  const fala = (pedido.split("Últimas mensagens:")[1] ?? pedido).split("\n").filter((l) => l.startsWith("Lead:")).at(-1)?.toLowerCase() ?? "";
  const r = (resposta: string, temperatura: string, status: string, naoSei = false) => JSON.stringify({ resposta, temperatura, status, naoSei, motivo: "simulado" });
  if (/quanto custa|pre[cç]o/.test(fala)) return r("Vou confirmar essa informação e já te retorno, combinado?", "MORNO", "EM_CONVERSA", true);
  if (/quero comprar|agendar|fechar/.test(fala)) return r("Ótimo! Vamos agendar. Qual o melhor dia e horário para você?", "QUENTE", "QUALIFICADO");
  if (/caro|vou pensar|sem tempo/.test(fala)) return r("Entendo! Posso te mostrar uma opção que cabe melhor no seu momento?", "MORNO", "OBJECAO");
  if (/não tenho interesse|nao tenho interesse/.test(fala)) return r("Tudo bem, obrigado pela atenção!", "FRIO", "EM_CONVERSA");
  return r("Que bom falar com você! Me conta um pouco do que você procura?", "MORNO", "EM_CONVERSA");
}

/** Suporte simulado (testes): reage à última fala do cliente com regras fixas. */
function suporteSimulado(pedido: string) {
  const fala = (pedido.split("Últimas mensagens:")[1] ?? pedido).split("\n").filter((l) => l.startsWith("Cliente:")).at(-1)?.toLowerCase() ?? "";
  const r = (resposta: string, chamarHumano = false) => JSON.stringify({ resposta, chamarHumano, motivo: "simulado" });
  if (/nao sei responder|não sei responder|aleatoria|aleatória/.test(fala)) return r("Vou chamar um atendente para te ajudar com isso.", true);
  if (/conectar|whatsapp|qr/.test(fala)) return r("Para conectar: abra WhatsApp no menu e leia o QR Code com o celular.");
  return r("Claro! Me conta um pouco mais sobre a sua dúvida?");
}
