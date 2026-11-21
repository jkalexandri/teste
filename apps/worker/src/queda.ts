// Decide o que fazer quando a conexão com o WhatsApp fecha (separado para poder testar).
import { DisconnectReason } from "@whiskeysockets/baileys";

export type DecisaoQueda =
  | { acao: "reconectar"; esperaMs: number }
  | { acao: "encerrar"; apagarLogin: boolean; erro: string };

/** Mensagens mostradas na tela quando a conexão cai. */
const ERROS: Record<number, string> = {
  [DisconnectReason.loggedOut]: "O WhatsApp foi desconectado pelo celular. Conecte de novo lendo o QR Code.",
  [DisconnectReason.forbidden]: "O WhatsApp bloqueou este número. Verifique o número no celular.",
  [DisconnectReason.connectionReplaced]: "Este WhatsApp foi aberto em outro lugar. Conecte de novo.",
  [DisconnectReason.badSession]: "A sessão ficou inválida. Conecte de novo lendo o QR Code.",
  [DisconnectReason.multideviceMismatch]: "Versão do WhatsApp incompatível. Atualize o app no celular e conecte de novo.",
};

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
