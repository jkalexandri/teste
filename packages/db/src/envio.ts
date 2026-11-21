// Regras de envio compartilhadas entre o site e o serviço 24/7 (etapa 8 — decisões #64 a #68).
// Funções puras (sem banco), para as telas e a fila usarem exatamente a mesma regra.

export type Modo = "CONSERVADOR" | "EQUILIBRADO" | "RAPIDO";

/** Parâmetros de cada modo do Antibloqueio (prévia + decisão #64). */
export const MODOS: Record<Modo, {
  rotulo: string; escudo: string; fundo: string; cor: string;
  segMin: number; segMax: number; bloco: number; esperaMin: number; porDia: number; porHora: number;
}> = {
  CONSERVADOR: { rotulo: "Conservador", escudo: "verde", fundo: "#dff6e9", cor: "#087a44", segMin: 30, segMax: 60, bloco: 50, esperaMin: 10, porDia: 200, porHora: 40 },
  EQUILIBRADO: { rotulo: "Equilibrado", escudo: "amarelo", fundo: "#fef3c7", cor: "#92400e", segMin: 20, segMax: 40, bloco: 80, esperaMin: 7, porDia: 350, porHora: 60 },
  RAPIDO: { rotulo: "Rápido", escudo: "vermelho", fundo: "#ffeef0", cor: "#9e1d2f", segMin: 10, segMax: 25, bloco: 120, esperaMin: 5, porDia: 500, porHora: 90 },
};

/** Aquecimento de número novo (decisão #64): máximo por dia conforme a idade da conexão. */
export function limiteAquecimento(diasConectado: number): number | null {
  if (diasConectado < 3) return 20;
  if (diasConectado < 7) return 50;
  if (diasConectado < 14) return 100;
  return null; // depois disso vale o limite do modo
}

/** Texto de descadastro padrão (decisão #66). */
export const TEXTO_DESCADASTRO_PADRAO = "Se não quiser mais receber nossas mensagens, responda *SAIR*.";
/** Palavras que marcam o lead como "Pediu para sair" (decisão #57). */
export const PALAVRAS_SAIR = ["SAIR", "PARAR", "STOP"];

/** Máximo de mensagens sem resposta por lead em 30 dias (decisão #64). */
export const MAX_SEM_RESPOSTA_30D = 2;

/** "08:30" ↔ 510 minutos */
export const horaParaMin = (h: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
  if (!m) return NaN;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? v : NaN;
};
export const minParaHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Domingo de Páscoa (algoritmo de Meeus) → Sexta-feira Santa = Páscoa − 2 dias. */
export function sextaSanta(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(Date.UTC(ano, mes - 1, dia));
  pascoa.setUTCDate(pascoa.getUTCDate() - 2);
  return pascoa.toISOString().slice(0, 10);
}

/** Data/hora "de parede" em São Paulo (fuso padrão — especificação). */
export function agoraSP(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { data: `${v("year")}-${v("month")}-${v("day")}`, minutos: (Number(v("hour")) % 24) * 60 + Number(v("minute")), diaSemana: dias[v("weekday")] ?? 0 };
}

export function ehFeriado(dataISO: string, feriados: string[]) {
  const mmdd = dataISO.slice(5);
  return feriados.some((f) => f === dataISO || f === mmdd || (f === "SEXTA-SANTA" && sextaSanta(Number(dataISO.slice(0, 4))) === dataISO));
}

/** Pode enviar agora? Segunda a sábado, fora de feriado, dentro da janela da conta e da faixa global (decisão #65). */
export function dentroDaJanela(janela: { inicio: number; fim: number }, global: { horaMinima: number; horaMaxima: number; feriados: string[] }, quando = new Date()) {
  const a = agoraSP(quando);
  if (a.diaSemana === 0) return { pode: false, motivo: "domingo" };
  if (ehFeriado(a.data, global.feriados)) return { pode: false, motivo: "feriado" };
  const inicio = Math.max(janela.inicio, global.horaMinima);
  const fim = Math.min(janela.fim, global.horaMaxima);
  if (a.minutos < inicio || a.minutos >= fim) return { pode: false, motivo: "fora do horário" };
  return { pode: true, motivo: "" };
}

/** Saudação variada (decisão #64): {saudacao} vira "Oi", "Olá" ou "Bom dia/Boa tarde/Boa noite". */
export function saudacao(sorteio: number, minutosDoDia: number) {
  const periodo = minutosDoDia < 720 ? "Bom dia" : minutosDoDia < 1080 ? "Boa tarde" : "Boa noite";
  return ["Oi", "Olá", periodo][Math.abs(Math.floor(sorteio)) % 3]!;
}

/** Monta o texto final de um lead: {nome}, {saudacao}, data/hora e descadastro. */
export function montarMensagem(
  texto: string,
  opcoes: { nome: string; saudacao: string; descadastro: boolean; textoDescadastro: string; incluirDataHora: boolean; quando?: Date },
) {
  const primeiroNome = opcoes.nome.trim().split(/\s+/)[0] ?? "";
  let t = texto
    .replace(/\{saudacao\}/gi, opcoes.saudacao)
    // Sem nome: "Olá {nome}, tudo bem?" vira "Olá, tudo bem?"
    .replace(/\s*\{nome\}/gi, (m) => (primeiroNome ? m.replace(/\{nome\}/i, primeiroNome) : ""))
    .trim();
  if (opcoes.incluirDataHora) {
    const q = opcoes.quando ?? new Date();
    t += `\n\n${q.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }
  if (opcoes.descadastro) t += `\n\n_${(opcoes.textoDescadastro || TEXTO_DESCADASTRO_PADRAO).replace(/^_|_$/g, "")}_`;
  return t;
}

/** Tem link? (aviso de link na 1ª mensagem — decisão #64) */
export const temLink = (t: string) => /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|com\.br|net|br|io|me|ly|app)\b)/i.test(t);

/** Tipos e tamanhos de anexo aceitos (decisões #67 e #68). */
export const ANEXOS: { tipos: string[]; rotulo: string; maxMB: number }[] = [
  { tipos: ["image/jpeg", "image/png"], rotulo: "Imagem (JPG/PNG)", maxMB: 5 },
  { tipos: ["application/pdf"], rotulo: "PDF", maxMB: 15 },
  { tipos: ["video/mp4", "video/3gpp", "video/quicktime"], rotulo: "Vídeo (MP4)", maxMB: 16 },
  { tipos: ["audio/mpeg", "audio/ogg", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/wav"], rotulo: "Áudio (MP3/OGG/M4A)", maxMB: 16 },
];
export function regraAnexo(tipo: string) {
  return ANEXOS.find((a) => a.tipos.includes(tipo)) ?? null;
}
