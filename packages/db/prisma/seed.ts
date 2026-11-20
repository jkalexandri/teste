// Carga inicial do banco.
// - Sempre: cria o Super Admin com o e-mail de SUPERADMIN_EMAIL (decisão #15),
//   com senha temporária (troca obrigatória no primeiro acesso).
// - Só fora de produção: contas de teste usadas pelos botões demo do login (decisão #3).
import { PrismaClient, Cargo, Modulo } from "@prisma/client";
import { gerarHash, gerarSenhaTemporaria } from "../src/senha";

const prisma = new PrismaClient();
const PRODUCAO = process.env.NEXT_PUBLIC_APP_ENV === "production";

function diasAFrente(dias: number) {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + dias);
  return d;
}

async function criarSuperAdmin() {
  const email = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    console.warn("SUPERADMIN_EMAIL não definido: Super Admin não criado.");
    return;
  }
  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    console.log("Super Admin já existe: " + email);
    return;
  }
  const temp = gerarSenhaTemporaria();
  await prisma.usuario.create({
    data: {
      nome: process.env.SUPERADMIN_NOME || "Super Admin",
      email,
      cargo: Cargo.SUPERADMIN,
      senhaTempHash: await gerarHash(temp),
      senhaTempExpiraEm: diasAFrente(7),
    },
  });
  console.log("Super Admin criado: " + email);
  console.log("Senha temporária (válida por 7 dias, troca obrigatória no 1º acesso): " + temp);
}

async function criarContasDeTeste() {
  // Contas da prévia, só para teste.
  const empresa = await prisma.empresa.upsert({
    where: { id: "teste-empresa-exemplo" },
    update: {},
    create: {
      id: "teste-empresa-exemplo",
      nome: "Empresa Exemplo",
      modulo: Modulo.EMPRESARIAL,
      pacote: "Padrão",
      limiteUsuarios: 10,
      expiraEm: diasAFrente(26),
    },
  });
  const individual = await prisma.empresa.upsert({
    where: { id: "teste-conta-individual" },
    update: {},
    create: {
      id: "teste-conta-individual",
      nome: "Conta Individual — Usuário Demo",
      modulo: Modulo.INDIVIDUAL,
      pacote: "Individual",
      limiteUsuarios: 1,
      expiraEm: diasAFrente(29),
    },
  });

  const contas = [
    { nome: "Super Admin (teste)", email: "superadmin@disparopro.com.br", senha: "Super@12345678", cargo: Cargo.SUPERADMIN, empresaId: null },
    { nome: "Admin da Empresa Exemplo", email: "admin-empresa@empresaexemplo.com.br", senha: "Admin@12345678", cargo: Cargo.ADMIN_EMPRESA, empresaId: empresa.id },
    { nome: "Ana Souza", email: "ana@empresaexemplo.com.br", senha: "User@12345678", cargo: Cargo.USUARIO, empresaId: empresa.id },
    { nome: "Usuário Demo", email: "usuario@disparopro.com.br", senha: "User@12345678", cargo: Cargo.USUARIO, empresaId: individual.id },
  ];
  for (const c of contas) {
    await prisma.usuario.upsert({
      where: { email: c.email },
      update: {},
      create: { nome: c.nome, email: c.email, cargo: c.cargo, empresaId: c.empresaId, senhaHash: await gerarHash(c.senha) },
    });
  }
  console.log("Contas de teste prontas (" + contas.length + ").");
}

async function main() {
  await criarSuperAdmin();
  if (!PRODUCAO) await criarContasDeTeste();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
