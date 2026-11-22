// IA simulada: respostas fixas, sem custo. Só para testes fora de produção.
import type { Conector, PedidoIA, RespostaIA } from "../tipos";

export const conectorSimulado: Conector = {
  async chamar(_cfg, p: PedidoIA): Promise<RespostaIA> {
    const ultimo = p.mensagens.at(-1)?.texto ?? "";
    // Para a geração de mensagens devolve o JSON esperado
    const texto = /"principal"/.test(p.sistema)
      ? JSON.stringify({
          principal: "{saudacao} {nome}, tudo bem? Vi que você pode se interessar pela nossa novidade. Posso te contar em 1 minuto?",
          variacoes: [
            "Oi {nome}! Tenho uma novidade que pode te ajudar. Posso explicar rapidinho?",
            "{saudacao} {nome}! Separei uma informação útil para você. Quer saber mais?",
            "Olá {nome}, tudo certo? Posso te mostrar uma oportunidade em poucos minutos?",
          ],
        })
      : `Resposta simulada para: ${ultimo.slice(0, 80)}`;
    return { texto, modelo: "simulado", uso: { entrada: Math.ceil((p.sistema.length + ultimo.length) / 4), saida: Math.ceil(texto.length / 4), cacheLeitura: 0, cacheEscrita: 0 } };
  },
};
