// Lê o campo de limite (components/app/CampoLimite) no servidor — decisões #58 e #77.
/** null = ilimitado; número = máximo; "erro" = não marcou ilimitado e não informou o número. */
export function lerLimite(form: FormData, campo = "limiteLeads"): number | null | "erro" {
  if (form.get(campo === "limiteLeads" ? "ilimitado" : `${campo}Ilimitado`) === "on") return null;
  const v = parseInt(String(form.get(campo) ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : "erro";
}
