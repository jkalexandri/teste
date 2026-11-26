// Decide o que fazer quando a conexão com o WhatsApp fecha (separado para poder testar).
import { DisconnectReason } from "@whiskeysockets/baileys";

export type DecisaoQueda =
  | { acao: "reconectar"; esperaMs: number }
  | { acao: "encerrar"; apagarLogin: boolean; erro: string };

/** Mensagens mostradas na tela quando a conexão cai. */
const ERROS: Record<number, string> = {
  [DisconnectReason.loggedOut]: "O WhatsApp foi desconectado pelo celular. Conecte de novo lendo o QR Code.",
  [DisconnectReason.forbidden]: "O WhatsApp bloqueou este número. Verifique o número no celular.",
  [DisconnectReason.badSession]: "A sessão ficou inválida. Conecte de novo lendo o QR Code.",
  [DisconnectReason.multideviceMismatch]: "Versão do WhatsApp incompatível. Atualize o app no celular e conecte de novo.",
};

/** "Aberto em outro lugar" (440): a mesma conexão foi aberta duas vezes. Encerra, mas MANTÉM o login (decisão #133). */
export const ERRO_OUTRO_LUGAR = "Este WhatsApp foi aberto em outro lugar. Clique em Conectar para voltar.";

/**
 * @param codigo   código da queda informado pelo WhatsApp
 * @param pareado  true quando o celular já leu o QR (creds.me preenchido)
 * @param qrGerado true se chegou a aparecer QR nesta tentativa
 * @param tentativas reconexões seguidas já feitas
 */
export function decidirQueda(codigo: number, pareado: boolean, qrGerado: boolean, tentativas: number): DecisaoQueda {
  // Depois da leitura do QR o WhatsApp SEMPRE pede para reiniciar a conexão (código 515).
  // Isso é normal: reconecta na hora, mantendo o login recém-criado.
  if (codigo === DisconnectReason.restartRequired) return { acao: "reconectar", esperaMs: 0 };

  // Antes apagava o login: uma conexão duplicada (2º serviço, corrida na reconexão) desconectava o cliente de vez.
  // Agora encerra sem reconectar sozinho (evita a disputa em loop) e o login continua salvo: "Conectar" volta sem QR.
  if (codigo === DisconnectReason.connectionReplaced) return { acao: "encerrar", apagarLogin: false, erro: ERRO_OUTRO_LUGAR };

  const erro = ERROS[codigo];
  if (erro) return { acao: "encerrar", apagarLogin: true, erro };

  if (!pareado) {
    // Ninguém leu o QR a tempo (ou nem chegou a gerar): para até o usuário pedir de novo.
    return {
      acao: "encerrar",
      apagarLogin: true,
      erro: qrGerado
        ? "O QR Code expirou. Clique em Conectar para gerar outro."
        : "Não foi possível falar com o WhatsApp agora. Tente conectar de novo em instantes.",
    };
  }
  // Queda comum (internet, servidor): reconecta com espera crescente, até 5 min.
  return { acao: "reconectar", esperaMs: Math.min(300_000, 2_000 * 2 ** tentativas) };
}

/**
 * Frase curta e fixa para a tela quando a conexão não consegue ABRIR (decisão #144 — M1). Nunca mostra detalhe técnico
 * (esse fica só no log do serviço).
 */
export function motivoDaFalha(e: unknown): string {
  const msg = String((e as { message?: unknown } | null)?.message ?? e ?? "");
  const codigo = String((e as { code?: unknown } | null)?.code ?? "");
  const nome = String((e as { name?: unknown } | null)?.name ?? "");
  // Login que não descriptografa (chave errada ou dado corrompido) — AES-GCM e formato do cripto.ts
  if (/Formato criptografado inválido|unable to authenticate data|bad decrypt|Invalid authentication tag|Unsupported state/i.test(msg)) return "Não foi possível ler o login salvo.";
  // Banco de dados (Prisma P1xxx = conexão) ou rede para o banco
  if (/^P10\d\d$/.test(codigo) || /PrismaClientInitializationError/.test(nome) || /Can't reach database|ECONNREFUSED|ECONNRESET|Connection terminated|timed out fetching a new connection/i.test(msg)) return "Banco de dados indisponível.";
  return "Falha ao abrir a conexão.";
}
