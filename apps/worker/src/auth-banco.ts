// Guarda o "login" do WhatsApp (credenciais + chaves do Signal) no Postgres,
// criptografado — no lugar dos arquivos que o Baileys usa por padrão.
// Assim a sessão sobrevive a reinícios da VPS e nada fica em texto puro no disco.
import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "@whiskeysockets/baileys";
import { prisma } from "@filapro/db";
import { criptografar, descriptografar } from "./cripto.js";

const paraTexto = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const deTexto = (t: string) => JSON.parse(t, BufferJSON.reviver);

export async function usarAuthNoBanco(sessaoId: string, chave: Buffer): Promise<{ state: AuthenticationState; salvarCreds: () => Promise<boolean> }> {
  const sessao = await prisma.whatsappSessao.findUnique({ where: { id: sessaoId } });
  const creds: AuthenticationCreds = sessao?.creds ? deTexto(descriptografar(sessao.creds, chave)) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        // Lê várias chaves de um tipo de uma vez
        get: async (tipo, ids) => {
          const linhas = await prisma.whatsappChave.findMany({ where: { sessaoId, tipo, chaveId: { in: ids } } });
          const saida: { [id: string]: SignalDataTypeMap[typeof tipo] } = {};
          for (const l of linhas) {
            let valor = deTexto(descriptografar(l.valor, chave));
            if (tipo === "app-state-sync-key" && valor) valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
            saida[l.chaveId] = valor;
          }
          return saida;
        },
        // Grava/apaga chaves (valor vazio = apagar), tudo numa transação
        set: async (dados) => {
          const ops = [];
          for (const tipo in dados) {
            const grupo = dados[tipo as keyof SignalDataTypeMap] ?? {};
            for (const chaveId in grupo) {
              const valor = grupo[chaveId];
              const where = { sessaoId_tipo_chaveId: { sessaoId, tipo, chaveId } };
              if (valor) {
                const v = criptografar(paraTexto(valor), chave);
                ops.push(prisma.whatsappChave.upsert({ where, create: { sessaoId, tipo, chaveId, valor: v }, update: { valor: v } }));
              } else {
                ops.push(prisma.whatsappChave.deleteMany({ where: { sessaoId, tipo, chaveId } }));
              }
            }
          }
          if (ops.length) await prisma.$transaction(ops);
        },
      },
    },
    // Só atualiza: NUNCA recria um registro apagado (decisão #138 — usuário excluído virava sessão "órfã" conectada).
    // false = o registro sumiu: quem chamou encerra a conexão.
    salvarCreds: async () => {
      const v = criptografar(paraTexto(creds), chave);
      const r = await prisma.whatsappSessao.updateMany({ where: { id: sessaoId }, data: { creds: v } });
      return r.count > 0;
    },
  };
}

/** Apaga o login salvo (após desconectar ou o WhatsApp encerrar a sessão). */
export async function apagarAuth(sessaoId: string) {
  await prisma.$transaction([
    prisma.whatsappChave.deleteMany({ where: { sessaoId } }),
    prisma.whatsappSessao.updateMany({ where: { id: sessaoId }, data: { creds: null } }),
  ]);
}
