// Teste REAL do WhatsApp na VPS (etapa 6b), sem precisar do site:
// 1) mostra o QR Code no terminal; 2) após a leitura, envia uma mensagem de teste;
// 3) desconecta e apaga a sessão de teste.
// Uso (na pasta apps/worker, com o .env carregado; pode rodar com o serviço pm2 ligado):
//   pnpm teste-qr 5511999999999
import { readFileSync } from "node:fs";
import pino from "pino";
import QRCode from "qrcode";
import { prisma } from "@filapro/db";
import { config } from "../src/config.js";
import { GerenciadorSessoes } from "../src/sessoes.js";

const SESSAO = "teste-vps";
const destino = process.argv[2];
if (!destino) {
  console.error("Informe o número que vai receber a mensagem de teste. Ex.: pnpm teste-qr 5511999999999");
  process.exit(1);
}

// Registro detalhado vai para o arquivo teste-qr.log (para diagnóstico); a tela fica limpa para o QR.
const ARQUIVO_LOG = "teste-qr.log";
const log = pino({ level: "debug" }, pino.destination({ dest: ARQUIVO_LOG, sync: true, append: false }));
const g = new GerenciadorSessoes(config.chaveCripto, log);
await g.conectar(SESSAO);

let ultimoQr = "";
let ultimoStatus = "";
const inicio = Date.now();
while (Date.now() - inicio < 3 * 60_000) {
  const s = await prisma.whatsappSessao.findUnique({ where: { id: SESSAO } });
  if (s && s.status !== ultimoStatus && s.status !== "AGUARDANDO_QR") {
    ultimoStatus = s.status;
    console.log(`[${new Date().toLocaleTimeString("pt-BR")}] status: ${s.status}`);
  }
  if (s?.status === "AGUARDANDO_QR") ultimoStatus = s.status;
  if (s?.qr && s.qr !== ultimoQr) {
    ultimoQr = s.qr;
    console.clear();
    console.log("Leia este QR Code no WhatsApp do celular (Dispositivos conectados → Conectar dispositivo):\n");
    console.log(await QRCode.toString(s.qr, { type: "terminal", small: true }));
  }
  if (s?.status === "CONECTADO") {
    console.log(`\n✅ Conectado como ${s.numero}. Enviando mensagem de teste para ${destino}…`);
    await new Promise((r) => setTimeout(r, 3000)); // espera a sincronização inicial
    console.log(await g.enviarTexto(SESSAO, destino, "✅ Teste da API própria do FilaPro Leads: mensagem enviada pela VPS."));
    break;
  }
  if (s?.status === "DESCONECTADO" && s.erro) {
    console.log(`\n❌ ${s.erro}`);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

// Resumo do registro (sem chaves nem senhas): o que o WhatsApp respondeu.
console.log("\n===== RESUMO PARA O SUPORTE (mande um print disto) =====");
const IMPORTANTES = /versão|conexão fechada|conectado|pair|error|errored|fail|close|restart|stream|login|success/i;
for (const linha of readFileSync(ARQUIVO_LOG, "utf8").split("\n")) {
  if (!linha) continue;
  try {
    const j = JSON.parse(linha) as { level: number; msg?: string; codigo?: number; versao?: unknown; err?: { message?: string }; trace?: string };
    if (j.level < 30 && !IMPORTANTES.test(j.msg ?? "")) continue;
    if (!IMPORTANTES.test(j.msg ?? "") && j.level < 40) continue;
    const extra = [j.codigo && `código ${j.codigo}`, j.versao && `versão ${JSON.stringify(j.versao)}`, j.err?.message, j.trace?.split("\n")[0]].filter(Boolean).join(" | ");
    console.log(`- ${j.msg ?? ""}${extra ? " → " + extra : ""}`.slice(0, 220));
  } catch {
    /* linha que não é JSON */
  }
}
console.log("========================================================\n");

console.log("Desconectando e apagando a sessão de teste…");
await g.desconectar(SESSAO);
await prisma.whatsappSessao.deleteMany({ where: { id: SESSAO } });
await prisma.$disconnect();
process.exit(0);
