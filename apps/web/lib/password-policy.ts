// Política de senha do FilaPro Leads (prompt seção 3.4):
// mínimo de 12 caracteres, com maiúscula, minúscula, número e caractere especial.
export type PasswordRule = { label: string; ok: boolean };

export function checkPassword(pw: string): PasswordRule[] {
  return [
    { label: "12+ caracteres", ok: pw.length >= 12 },
    { label: "Maiúscula", ok: /[A-Z]/.test(pw) },
    { label: "Minúscula", ok: /[a-z]/.test(pw) },
    { label: "Número", ok: /[0-9]/.test(pw) },
    { label: "Especial", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function isPasswordValid(pw: string): boolean {
  return checkPassword(pw).every((r) => r.ok);
}
