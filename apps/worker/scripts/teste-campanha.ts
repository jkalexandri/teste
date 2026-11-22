// Teste REAL de campanha na VPS (etapa 8b), sem precisar do site:
// 1) conecta um WhatsApp de teste pelo QR (o número que ENVIA);
// 2) cria uma campanha com 1 lead (o número que RECEBE) e envia pelo motor de disparos,
//    com "digitando…", descadastro e (opcional) uma imagem;
// 3) espera a sua resposta no celular que recebeu: "SAIR" deve marcar "Pediu para sair";
//    qualquer outra resposta deve marcar "Em conversa";
// 4) desconecta e apaga tudo o que criou.
// Uso (na pasta apps/worker, com o .env carregado):
//   pnpm teste-campanha 5511999999999            (só texto)
//   pnpm teste-campanha 5511999999999 foto.jpg   (com imagem)
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import pino from "pino";
import QRCode from "qrcode";
import { prisma, Cargo, Modulo, StatusCampanha } from "@filapro/db";
import { config } from "../src/config.js";
import { GerenciadorSessoes } from "../src/sessoes.js";
import { MotorDisparos } from "../src/disparos.js";

const destino = (process.argv[2] ?? "").replace(/\D/g, "");
const imagem = process.argv[3];
if (!/^\d{12,15}$/.test(destino)) {
  console.error("Informe o número que vai RECEBER, com 55 e DDD. Ex.: pnpm teste-campanha 5511999999999 [foto.jpg]");
  process.exit(1);
}
const EMP = "teste-vps-emp", USU = "teste-vps-usu";
const log = pino({ level: "warn" });
const g = new GerenciadorSessoes(config.chaveCripto, log);
const motor = new MotorDisparos(g, log, { pastaArquivos: config.pastaArquivos, ignorarJanela: true });
g.aoReceber = async (s, tel, txt) => {
  console.log(`📩 Resposta recebida de ${tel}: "${txt}"`);
  await motor.registrarResposta(s, tel, txt);
};

async function limpar() {
  await g.desconectar(USU).catch(() => undefined);
  await prisma.campanha.deleteMany({ where: { usuarioId: USU } });
  await prisma.whatsappSessao.deleteMany({ where: { id: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
}

await limpar();
await prisma.empresa.create({ data: { id: EMP, codigo: "TESTE-VPS", nome: "Teste VPS", modulo: Modulo.INDIVIDUAL, pacote: "Teste", limiteUsuarios: 1, expiraEm: new Date(Date.now() + 86400000) } });
await prisma.usuario.create({ data: { id: USU, codigo: "TESTE-VPS", nome: "Teste VPS", email: "teste-vps@filaproleads.local", cargo: Cargo.USUARIO, empresaId: EMP } });

// 1) QR Code
await g.conectar(USU, USU);
let ultimoQr = "";
const inicio = Date.now();
for (;;) {
  const s = await prisma.whatsappSessao.findUnique({ where: { id: USU } });
  if (s?.qr && s.qr !== ultimoQr) {
    ultimoQr = s.qr;
    console.clear();
    console.log("Leia este QR Code com o celular que vai ENVIAR (Dispositivos conectados → Conectar dispositivo):\n");
    console.log(await QRCode.toString(s.qr, { type: "terminal", small: true }));
  }
  if (s?.status === "CONECTADO") { console.log(`\n✅ Conectado como ${s.numero}.`); break; }
  if (s?.status === "DESCONECTADO" && s.erro) { console.log(`\n❌ ${s.erro}`); await limpar(); process.exit(1); }
  if (Date.now() - inicio > 3 * 60_000) { console.log("\n❌ Tempo esgotado."); await limpar(); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000)); // sincronização inicial

// 2) Campanha com 1 lead
let arquivoId: string | null = null;
if (imagem) {
  const info = await stat(imagem);
  const tipo = /\.png$/i.test(imagem) ? "image/png" : "image/jpeg";
  const a = await prisma.arquivo.create({ data: { usuarioId: USU, nome: basename(imagem), tipo, tamanho: info.size } });
  await mkdir(config.pastaArquivos, { recursive: true });
  await copyFile(imagem, join(config.pastaArquivos, a.id));
  arquivoId = a.id;
}
const lead = await prisma.lead.create({ data: { codigo: "L-TESTE-VPS", nome: "Teste Receptor", telefone: destino, usuarioId: USU, empresaId: EMP, codigoUsuario: "TESTE-VPS", codigoEmpresa: "TESTE-VPS" } });
const c = await prisma.campanha.create({
  data: {
    usuarioId: USU, empresaId: EMP, assunto: "Teste real VPS", status: StatusCampanha.EM_ANDAMENTO, iniciadaEm: new Date(), totalLeads: 1,
    mensagem: "{saudacao} {nome}! Este é um teste real do FilaPro Leads (campanha pela VPS).", descadastro: true, arquivoId,
  },
});
await prisma.envio.create({ data: { campanhaId: c.id, leadId: lead.id, telefone: destino, nome: lead.nome } });
console.log(`Enviando para ${destino}${imagem ? " com imagem" : ""} (aparece "digitando…" antes)…`);
const r = await motor.passo(USU);
const env = await prisma.envio.findFirst({ where: { campanhaId: c.id } });
console.log(r.acao === "enviou" ? "✅ Mensagem enviada." : `❌ Não enviou: ${r.acao} ${r.motivo ?? ""} ${env?.motivo ?? ""}`);

// 3) Resposta
if (r.acao === "enviou") {
  console.log('\nAgora, no celular que RECEBEU, responda "SAIR" (ou qualquer outra coisa). Esperando até 3 minutos…');
  const fim = Date.now() + 3 * 60_000;
  let status = "NOVO";
  while (Date.now() < fim) {
    status = (await prisma.lead.findUnique({ where: { id: lead.id } }))?.status ?? status;
    if (status !== "NOVO") break;
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  console.log(status === "PEDIU_SAIR" ? '✅ Resposta "SAIR" recebida: lead marcado como "Pediu para sair".'
    : status === "EM_CONVERSA" ? '✅ Resposta recebida: lead marcado como "Em conversa".'
    : "⚠️ Nenhuma resposta recebida no tempo.");
}

console.log("\nDesconectando e apagando os dados do teste…");
await limpar();
await prisma.$disconnect();
process.exit(0);
