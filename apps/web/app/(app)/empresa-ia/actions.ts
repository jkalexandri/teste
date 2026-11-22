"use server";

// Empresa | IA (etapa 9b — decisões #74, #75 e #77). A leitura pesada (sites, PDFs, imagens) e a
// montagem da ficha acontecem no serviço 24/7; aqui só cadastramos e pedimos o processamento.
import { revalidatePath } from "next/cache";
import { prisma, StatusMaterial, TipoMaterial } from "@filapro/db";
import { atorEmpresaIA, LIMITES_MATERIAL, mesAtual } from "@/lib/empresa-ia";
import { apagarArquivoDoWorker, chamarWorker, guardarArquivoNoWorker } from "@/lib/worker";

type R = { ok: boolean; mensagem: string };
const txt = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

/** Quem pode treinar: edita a ficha e a conta está com o treinamento ligado. */
async function quemTreina() {
  const a = await atorEmpresaIA();
  if (!a.podeEditar) return { erro: "Só o administrador da conta pode alterar o Empresa | IA." } as const;
  if (!a.treinarIA) return { erro: "O treinamento da IA está desligado para esta conta. Fale com o suporte." } as const;
  return a;
}

/** Confere os limites do plano antes de aceitar um material novo (decisão #77). */
async function conferirLimites(a: Awaited<ReturnType<typeof atorEmpresaIA>>) {
  if (a.limiteMateriais != null) {
    const total = await prisma.materialIA.count({ where: { fichaId: a.ficha.id } });
    if (total >= a.limiteMateriais) return `Limite de ${a.limiteMateriais} materiais do plano atingido. Use “Esquecer” em algum material ou fale com o suporte.`;
  }
  if (a.limitePaginasMes != null) {
    const usadas = a.ficha.mesRef === mesAtual() ? a.ficha.paginasMes : 0;
    if (usadas >= a.limitePaginasMes) return `Limite de ${a.limitePaginasMes} páginas por mês atingido. Libera no mês que vem ou com o suporte.`;
  }
  return null;
}

function atualizar() {
  revalidatePath("/empresa-ia");
}

/** Os 5 campos da empresa. Salvar refaz a ficha. */
export async function salvarCampos(form: FormData): Promise<R> {
  const a = await atorEmpresaIA();
  if (!a.podeEditar) return { ok: false, mensagem: "Só o administrador da conta pode alterar o Empresa | IA." };
  const dados = {
    nome: txt(form.get("nome"), 120),
    endereco: txt(form.get("endereco"), 300),
    telefone: txt(form.get("telefone"), 40),
    whatsapp: txt(form.get("whatsapp"), 40),
    atividade: txt(form.get("atividade"), 2000),
  };
  if (!dados.nome) return { ok: false, mensagem: "Informe o nome da empresa." };
  await prisma.fichaEmpresa.update({ where: { id: a.ficha.id }, data: dados });
  // A ficha só é refeita pela IA quando o treinamento está ligado
  const r = a.treinarIA ? await chamarWorker(`/ia/fichas/${a.ficha.id}/montar`) : { ok: true };
  atualizar();
  return { ok: true, mensagem: r.ok ? "Dados salvos. A ficha da IA está sendo atualizada." : "Dados salvos. A ficha será atualizada quando o serviço voltar." };
}

async function processar(materialId: string): Promise<R> {
  const r = await chamarWorker(`/ia/materiais/${materialId}/processar`);
  if (!r.ok) {
    await prisma.materialIA.update({ where: { id: materialId }, data: { status: StatusMaterial.ERRO, erro: "Serviço fora do ar. Use “Ler de novo” mais tarde." } });
    return { ok: false, mensagem: r.mensagem };
  }
  return { ok: true, mensagem: "Material recebido. A IA está lendo." };
}

/** Link ou site: a página e as do mesmo site ligadas a ela, até 20 (decisão #74). */
export async function adicionarLink(form: FormData): Promise<R> {
  const a = await quemTreina();
  if ("erro" in a) return { ok: false, mensagem: a.erro! };
  let url = txt(form.get("url"), 500);
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
  } catch {
    return { ok: false, mensagem: "Endereço inválido. Exemplo: https://suaempresa.com.br" };
  }
  const limite = await conferirLimites(a);
  if (limite) return { ok: false, mensagem: limite };
  const m = await prisma.materialIA.create({ data: { fichaId: a.ficha.id, tipo: TipoMaterial.LINK, origem: url } });
  const r = await processar(m.id);
  atualizar();
  return r;
}

export async function adicionarTexto(form: FormData): Promise<R> {
  const a = await quemTreina();
  if ("erro" in a) return { ok: false, mensagem: a.erro! };
  const titulo = txt(form.get("titulo"), 120) || "Texto";
  const texto = String(form.get("texto") ?? "").trim();
  if (texto.length < 20) return { ok: false, mensagem: "Escreva o texto (pelo menos uma frase)." };
  if (texto.length > LIMITES_MATERIAL.textoMax) return { ok: false, mensagem: `Texto muito longo (máximo ${LIMITES_MATERIAL.textoMax.toLocaleString("pt-BR")} caracteres).` };
  const limite = await conferirLimites(a);
  if (limite) return { ok: false, mensagem: limite };
  const m = await prisma.materialIA.create({ data: { fichaId: a.ficha.id, tipo: TipoMaterial.TEXTO, origem: titulo, conteudo: texto } });
  const r = await processar(m.id);
  atualizar();
  return r;
}

/** Imagem JPG/PNG até 5 MB ou PDF até 20 MB / 100 páginas (decisão #74). */
export async function enviarMaterialArquivo(form: FormData): Promise<R> {
  const a = await quemTreina();
  if ("erro" in a) return { ok: false, mensagem: a.erro! };
  const f = form.get("arquivo");
  if (!(f instanceof File) || f.size === 0) return { ok: false, mensagem: "Escolha um arquivo." };
  const pdf = f.type === "application/pdf";
  const imagem = (LIMITES_MATERIAL.tiposImagem as readonly string[]).includes(f.type);
  if (!pdf && !imagem) return { ok: false, mensagem: "Tipo não aceito. Use imagem JPG/PNG ou PDF." };
  // O arquivo precisa ser do tipo da aba escolhida
  const esperado = String(form.get("esperado") ?? "");
  if (esperado === "IMAGEM" && !imagem) return { ok: false, mensagem: "Escolha uma imagem JPG ou PNG." };
  if (esperado === "PDF" && !pdf) return { ok: false, mensagem: "Escolha um arquivo PDF." };
  const maxMB = pdf ? LIMITES_MATERIAL.pdfMB : LIMITES_MATERIAL.imagemMB;
  if (f.size > maxMB * 1024 * 1024) return { ok: false, mensagem: `${pdf ? "PDF" : "Imagem"}: máximo de ${maxMB} MB.` };
  const limite = await conferirLimites(a);
  if (limite) return { ok: false, mensagem: limite };
  // Guarda o tipo no nome (o serviço usa a extensão para saber se é PNG ou JPG)
  let nome = f.name.slice(0, 120) || (pdf ? "arquivo.pdf" : "imagem.jpg");
  if (imagem && !/\.(png|jpe?g)$/i.test(nome)) nome += f.type === "image/png" ? ".png" : ".jpg";
  const m = await prisma.materialIA.create({ data: { fichaId: a.ficha.id, tipo: pdf ? TipoMaterial.PDF : TipoMaterial.IMAGEM, origem: nome } });
  const g = await guardarArquivoNoWorker(`mat-${m.id}`, await f.arrayBuffer());
  if (!g.ok) {
    await prisma.materialIA.delete({ where: { id: m.id } });
    return { ok: false, mensagem: g.mensagem };
  }
  const r = await processar(m.id);
  atualizar();
  return r;
}

async function meuMaterial(id: string) {
  const a = await atorEmpresaIA();
  const m = await prisma.materialIA.findUnique({ where: { id } });
  return m && m.fichaId === a.ficha.id ? { a, m } : null;
}

/** "Esquecer": apaga o material e refaz a ficha sem ele. */
export async function esquecerMaterial(id: string): Promise<R> {
  const x = await meuMaterial(id);
  if (!x) return { ok: false, mensagem: "Material não encontrado." };
  if (!x.a.podeEditar) return { ok: false, mensagem: "Só o administrador da conta pode alterar o Empresa | IA." };
  await prisma.materialIA.delete({ where: { id } });
  if (x.m.tipo === TipoMaterial.PDF || x.m.tipo === TipoMaterial.IMAGEM) await apagarArquivoDoWorker(`mat-${id}`);
  if (x.a.treinarIA) await chamarWorker(`/ia/fichas/${x.a.ficha.id}/montar`);
  atualizar();
  return { ok: true, mensagem: "Material esquecido. A ficha está sendo refeita sem ele." };
}

/** "Ler de novo": lê o material outra vez (ex.: o site mudou — decisão #74). */
export async function lerDeNovo(id: string): Promise<R> {
  const x = await meuMaterial(id);
  if (!x) return { ok: false, mensagem: "Material não encontrado." };
  const a = await quemTreina();
  if ("erro" in a) return { ok: false, mensagem: a.erro! };
  if (x.m.status === StatusMaterial.LENDO) return { ok: false, mensagem: "Este material ainda está sendo lido." };
  if (a.limitePaginasMes != null) {
    const usadas = a.ficha.mesRef === mesAtual() ? a.ficha.paginasMes : 0;
    if (usadas >= a.limitePaginasMes) return { ok: false, mensagem: `Limite de ${a.limitePaginasMes} páginas por mês atingido. Libera no mês que vem ou com o suporte.` };
  }
  await prisma.materialIA.update({ where: { id }, data: { status: StatusMaterial.LENDO, erro: null } });
  const r = await processar(id);
  atualizar();
  return r.ok ? { ok: true, mensagem: "Lendo de novo…" } : r;
}

/** Estado atual (a tela consulta enquanto houver material sendo lido ou ficha sendo montada). */
export async function estadoEmpresaIA() {
  const a = await atorEmpresaIA();
  const [ficha, lendo] = await Promise.all([
    prisma.fichaEmpresa.findUnique({ where: { id: a.ficha.id }, select: { montando: true, resumoEm: true } }),
    prisma.materialIA.count({ where: { fichaId: a.ficha.id, status: StatusMaterial.LENDO } }),
  ]);
  return { lendo, montando: !!ficha?.montando, resumoEm: ficha?.resumoEm?.toISOString() ?? null };
}
