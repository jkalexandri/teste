// Teste REAL do WhatsApp na VPS (etapa 6b), sem precisar do site:
// 1) mostra o QR Code no terminal; 2) após a leitura, envia uma mensagem de teste;
// 3) desconecta e apaga a sessão de teste.
// Uso (na pasta apps/worker, com o .env carregado; pode rodar com o serviço pm2 ligado):
//   pnpm teste-qr 5511999999999
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

const log = pino({ level: "warn" });
const g = new GerenciadorSessoes(config.chaveCripto, log);
await g.conectar(SESSAO);

let ultimoQr = "";
const inicio = Date.now();
while (Date.now() - inicio < 3 * 60_000) {
  const s = await prisma.whatsappSessao.findUnique({ where: { id: SESSAO } });
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

console.log("Desconectando e apagando a sessão de teste…");
await g.desconectar(SESSAO);
await prisma.whatsappSessao.deleteMany({ where: { id: SESSAO } });
await prisma.$disconnect();
process.exit(0);
