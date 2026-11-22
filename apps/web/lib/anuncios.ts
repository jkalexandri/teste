// Leads de anúncios (etapa 10b — decisões #82, #84, #90 e #94): lê o formulário que chega no endereço secreto.
// Aceita o formato do Google Ads (user_column_data) e um formato livre (Make/Zapier com Facebook/Instagram Lead Ads).
import { normalizarTelefone } from "@/lib/telefone";

export type FormularioAnuncio = { origem: string; nome: string; telefone: string; telefoneBruto: string; email: string; assunto: string };

const CHAVES_NOME = ["nome", "name", "full_name", "fullname", "nome_completo", "first_name"];
const CHAVES_TELEFONE = ["telefone", "phone", "phone_number", "whatsapp", "celular", "fone", "telephone", "mobile"];
const CHAVES_EMAIL = ["email", "e-mail", "e_mail", "mail"];
const CHAVES_ASSUNTO = ["assunto", "mensagem", "message", "subject", "interesse", "produto", "campanha", "campaign_name", "form_name", "ad_name"];
/** Campos técnicos que não interessam à IA */
const IGNORAR = ["google_key", "api_version", "gcl_id", "lead_id", "form_id", "campaign_id", "adgroup_id", "creative_id", "is_test", "token", "secret"];

const norm = (k: string) => k.toLowerCase().trim().replace(/[\s-]+/g, "_").normalize("NFD").replace(/[̀-ͯ]/g, "");
const texto = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/** Junta tudo num mapa simples chave → valor (achata objetos de 1 nível, como "field_data" do Facebook). */
function achatar(corpo: Record<string, unknown>) {
  const campos = new Map<string, string>();
  /** Nome do campo como veio no formulário (para mostrar à IA e na lista) */
  const nomes = new Map<string, string>();
  const por = (k: string, v: unknown) => {
    const t = texto(v);
    if (t && !campos.has(norm(k))) { campos.set(norm(k), t.slice(0, 500)); nomes.set(norm(k), k.trim()); }
  };
  // Google Ads: user_column_data = [{ column_id|column_name, string_value }]
  if (Array.isArray(corpo.user_column_data)) {
    for (const c of corpo.user_column_data as Record<string, unknown>[]) por(String(c.column_id ?? c.column_name ?? ""), c.string_value);
  }
  // Facebook (via Make/Zapier às vezes): field_data = [{ name, values: [..] }]
  if (Array.isArray(corpo.field_data)) {
    for (const c of corpo.field_data as Record<string, unknown>[]) por(String(c.name ?? ""), Array.isArray(c.values) ? c.values[0] : c.values);
  }
  for (const [k, v] of Object.entries(corpo)) {
    if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) por(k2, v2);
    else por(k, v);
  }
  return { campos, nomes };
}

export function lerFormulario(corpo: Record<string, unknown>): FormularioAnuncio {
  const { campos, nomes } = achatar(corpo);
  const pegar = (chaves: string[]) => { for (const c of chaves) { const v = campos.get(c); if (v) return v; } return ""; };
  const telefoneBruto = pegar(CHAVES_TELEFONE);
  const usados = new Set([...CHAVES_NOME, ...CHAVES_TELEFONE, ...CHAVES_EMAIL, ...IGNORAR]);
  // Assunto: o campo de assunto + as outras respostas do formulário (vão para a IA escrever a primeira mensagem)
  const extras = [...campos.entries()].filter(([k]) => !usados.has(k) && !CHAVES_ASSUNTO.includes(k)).map(([k, v]) => `${nomes.get(k) ?? k}: ${v}`);
  const assunto = [pegar(CHAVES_ASSUNTO), ...extras].filter(Boolean).join("\n").slice(0, 2000);
  const origem = Array.isArray(corpo.user_column_data) ? "google" : Array.isArray(corpo.field_data) || campos.has("ad_name") || campos.has("form_name") ? "facebook" : "outro";
  return { origem, nome: pegar(CHAVES_NOME).slice(0, 120), telefone: normalizarTelefone(telefoneBruto), telefoneBruto, email: pegar(CHAVES_EMAIL).slice(0, 200), assunto };
}
