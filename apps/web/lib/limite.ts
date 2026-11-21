// Lê o campo de limite de leads (components/app/CampoLimite) no servidor — decisão #58.
/** null = ilimitado; número = máximo; "erro" = não marcou ilimitado e não informou o número. */
export function lerLimite(form: FormData): number | null | "erro" {
  if (form.get("ilimitado") === "on") return null;
  const v = parseInt(String(form.get("limiteLeads") ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : "erro";
}
