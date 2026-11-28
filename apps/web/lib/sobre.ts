// Texto do "Sobre" do login (decisão #189): o Super Admin edita em Planos; vazio = texto padrão (o que já aparecia no login).
export const MAX_SOBRE = 4000;

/** Texto padrão: só reaproveita o que já existia na tela de login. Linhas em branco separam os parágrafos. */
export const SOBRE_PADRAO = `O futuro do disparo inteligente.

Envios com ritmo, contexto e proteção: sua operação de WhatsApp pronta para escalar sem perder o controle.

Antibloqueio Inteligente: cadência, blocos e pausas que protegem sua conta.

IA que Atende, Contorna Objeções e Qualifica: conversas com contexto do seu negócio.

Online na Nuvem 24/7: seus envios seguem a cadência definida, sem parar.`;

export type Trecho = { tipo: "texto" | "link"; valor: string };
/** Parágrafos (separados por linha em branco) e, dentro deles, os endereços http(s) viram links. Nada de HTML. */
export function paragrafos(texto: string): Trecho[][] {
  return texto.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const partes: Trecho[] = [];
    let resto = p;
    for (;;) {
      const m = /https?:\/\/[^\s<>"']+/i.exec(resto);
      if (!m) { if (resto) partes.push({ tipo: "texto", valor: resto }); break; }
      if (m.index > 0) partes.push({ tipo: "texto", valor: resto.slice(0, m.index) });
      // pontuação colada no fim do endereço não faz parte dele
      const link = m[0].replace(/[.,;:!?)]+$/, "");
      partes.push({ tipo: "link", valor: link });
      resto = resto.slice(m.index + link.length);
    }
    return partes;
  });
}
