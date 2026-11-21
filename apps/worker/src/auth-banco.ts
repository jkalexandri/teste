// Guarda o "login" do WhatsApp (credenciais + chaves do Signal) no Postgres,
// criptografado — no lugar dos arquivos que o Baileys usa por padrão.
// Assim a sessão sobrevive a reinícios da VPS e nada fica em texto puro no disco.
import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "@whiskeysockets/baileys";
import { prisma } from "@filapro/db";
import { criptografar, descriptografar } from "./cripto.js";

const paraTexto = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const deTexto = (t: string) => JSON.parse(t, BufferJSON.reviver);

export async function usarAuthNoBanco(sessaoId: string, chave: Buffer): Promise<{ state: AuthenticationState; salvarCreds: () => Promise<void> }> {
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
    salvarCreds: async () => {
      const v = criptografar(paraTexto(creds), chave);
      await prisma.whatsappSessao.upsert({ where: { id: sessaoId }, create: { id: sessaoId, creds: v }, update: { creds: v } });
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
