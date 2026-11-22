// Testes do Empresa | IA no serviço 24/7 (etapa 9b): segurança dos links, leitura de site/PDF/texto/imagem,
// limites do plano e montagem da ficha — com a IA "simulado" e o banco real.
// Rodar: DATABASE_URL=... pnpm --filter worker test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { prisma, Modulo, StatusMaterial, TipoMaterial } from "@filapro/db";
import { Aprendizado, lerPdf, lerSite, linksDoHtml, textoDoHtml, urlPermitida, MAX_PAGINAS_SITE } from "../src/aprender.js";

const EMP = "teste-aprender-emp";
let pasta = "";
let configAntes: Awaited<ReturnType<typeof prisma.configIA.findUnique>> = null;

/** PDF mínimo válido com uma página de texto por item. */
function pdfCom(paginas: string[]) {
  const objs: string[] = [];
  const kids = paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  paginas.forEach((t, i) => {
    const conteudo = `BT /F1 12 Tf 72 720 Td (${t}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const pos: number[] = [];
  objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), "aprender-"));
  configAntes = await prisma.configIA.findUnique({ where: { tarefa: "aprender" } });
  const dados = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  await prisma.configIA.upsert({ where: { tarefa: "aprender" }, update: dados, create: { tarefa: "aprender", ...dados } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.empresa.create({
    data: { id: EMP, nome: "Teste Aprender", modulo: Modulo.INDIVIDUAL, pacote: "Teste", limiteUsuarios: 1, expiraEm: new Date(Date.now() + 86400000), limitePaginasMes: 5 },
  });
});

after(async () => {
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.usoIA.deleteMany({ where: { empresaId: EMP } });
  if (configAntes) {
    const { tarefa, ...resto } = configAntes;
    await prisma.configIA.update({ where: { tarefa }, data: resto });
  } else await prisma.configIA.deleteMany({ where: { tarefa: "aprender" } });
  await prisma.$disconnect();
});

test("links: só endereços públicos http/https", async () => {
  for (const u of ["http://127.0.0.1/x", "http://localhost:4000", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "ftp://exemplo.com", "file:///etc/passwd", "http://[::1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:a00:1]/", "http://user:senha@1.1.1.1/", "nada"]) {
    assert.equal(await urlPermitida(u), null, u);
  }
  assert.ok(await urlPermitida("http://1.1.1.1/"));
});

test("texto e links do HTML", () => {
  const html = `<html><head><title>Imobiliária X</title><style>.a{}</style></head><body><script>alert(1)</script>
    <h1>Casas &amp; apartamentos</h1><p>Aluguel</p><a href="/sobre">Sobre</a><a href="https://outro.com/x">fora</a><a href="/foto.jpg">foto</a><a href="#topo">topo</a></body></html>`;
  const t = textoDoHtml(html);
  assert.match(t, /^# Imobiliária X/);
  assert.match(t, /Casas & apartamentos/);
  assert.doesNotMatch(t, /alert|\.a\{/);
  assert.deepEqual(linksDoHtml(html, new URL("https://site.com.br/")), ["https://site.com.br/sobre"]);
});

test("site: segue as páginas do mesmo site, no máximo 20", async () => {
  const visitadas: string[] = [];
  const falso = async (u: URL) => {
    visitadas.push(u.toString());
    const n = Number(u.pathname.slice(2) || 0);
    return { url: u, html: `<title>P${n}</title><p>Página ${n}</p><a href="/p${n + 1}">próxima</a><a href="/p${n + 2}">outra</a>` };
  };
  const r = await lerSite("https://1.1.1.1/", falso);
  assert.equal(r.paginas, MAX_PAGINAS_SITE);
  assert.equal(new Set(visitadas).size, visitadas.length, "sem repetir página");
  assert.match(r.texto, /Página 0/);
  await assert.rejects(lerSite("http://127.0.0.1/"), /não permitido/);
});

test("PDF: lê o texto e conta as páginas", async () => {
  const r = await lerPdf(pdfCom(["Tabela de precos", "Contato e horarios"]));
  assert.equal(r.paginas, 2);
  assert.match(r.texto, /Tabela de precos/);
  assert.match(r.texto, /Contato e horarios/);
});

test("processar: texto, PDF, imagem e site viram resumo; a ficha é montada", async () => {
  const ficha = await prisma.fichaEmpresa.create({ data: { empresaId: EMP, nome: "Teste Aprender", atividade: "Imobiliária" } });
  const leitorSite = async () => ({ texto: "Site da imobiliária: aluguel e venda.", paginas: 2 });
  const ap = new Aprendizado(pino({ level: "silent" }), pasta, leitorSite);

  const texto = await prisma.materialIA.create({ data: { fichaId: ficha.id, tipo: TipoMaterial.TEXTO, origem: "Preços", conteudo: "Aluguel a partir de R$ 1.500. Venda com financiamento." } });
  const link = await prisma.materialIA.create({ data: { fichaId: ficha.id, tipo: TipoMaterial.LINK, origem: "https://exemplo.com.br" } });
  const pdf = await prisma.materialIA.create({ data: { fichaId: ficha.id, tipo: TipoMaterial.PDF, origem: "catalogo.pdf" } });
  await writeFile(join(pasta, `mat-${pdf.id}`), pdfCom(["Catalogo de imoveis"]));
  const img = await prisma.materialIA.create({ data: { fichaId: ficha.id, tipo: TipoMaterial.IMAGEM, origem: "folder.png" } });
  await writeFile(join(pasta, `mat-${img.id}`), Buffer.from("iVBORw0KGgo=", "base64"));

  for (const m of [texto, link, pdf, img]) await ap.processar(m.id);
  const lidos = await prisma.materialIA.findMany({ where: { fichaId: ficha.id } });
  for (const m of lidos) {
    assert.equal(m.status, StatusMaterial.PRONTO, `${m.tipo}: ${m.erro}`);
    assert.ok(m.resumo.length > 0, `${m.tipo} sem resumo`);
  }
  assert.equal(lidos.find((m) => m.tipo === TipoMaterial.LINK)!.paginas, 2);
  assert.equal(lidos.find((m) => m.tipo === TipoMaterial.PDF)!.paginas, 1);
  let f = await prisma.fichaEmpresa.findUniqueOrThrow({ where: { id: ficha.id } });
  assert.equal(f.paginasMes, 5, "1 (texto) + 2 (site) + 1 (PDF) + 1 (imagem)");

  // Limite de 5 páginas por mês: o próximo material dá erro com o motivo
  const extra = await prisma.materialIA.create({ data: { fichaId: ficha.id, tipo: TipoMaterial.TEXTO, origem: "Extra", conteudo: "Mais informações da empresa." } });
  await ap.processar(extra.id);
  const e = await prisma.materialIA.findUniqueOrThrow({ where: { id: extra.id } });
  assert.equal(e.status, StatusMaterial.ERRO);
  assert.match(e.erro ?? "", /Limite de 5 páginas/);

  // PDF com erro (arquivo inválido) fica com status ERRO, sem derrubar o serviço
  const ruim = await prisma.materialIA.create({ data: { fichaId: ficha.id, tipo: TipoMaterial.PDF, origem: "ruim.pdf" } });
  await writeFile(join(pasta, `mat-${ruim.id}`), Buffer.from("não é pdf"));
  await ap.processar(ruim.id);
  assert.equal((await prisma.materialIA.findUniqueOrThrow({ where: { id: ruim.id } })).status, StatusMaterial.ERRO);

  await ap.montar(ficha.id);
  f = await prisma.fichaEmpresa.findUniqueOrThrow({ where: { id: ficha.id } });
  assert.equal(f.montando, false);
  assert.ok(f.resumo.length > 0 && f.resumoEm, "ficha montada");
  assert.ok((await prisma.usoIA.count({ where: { empresaId: EMP, tarefa: "aprender" } })) >= 5, "uso da IA registrado");
});
