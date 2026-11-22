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

/**
 * Gera uma senha forte (decisão #98): 16 caracteres, com maiúscula, minúscula, número e especial,
 * sem letras que se confundem (O/0, l/1/I). Usa o gerador seguro do navegador/servidor.
 */
export function gerarSenhaForte(tamanho = 16): string {
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%&*?-_+="];
  const todos = grupos.join("");
  const sorteio = (n: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]! % n; };
  // Um de cada grupo + o resto de qualquer grupo; depois embaralha
  const letras = grupos.map((g) => g[sorteio(g.length)]!);
  while (letras.length < tamanho) letras.push(todos[sorteio(todos.length)]!);
  for (let i = letras.length - 1; i > 0; i--) { const j = sorteio(i + 1); [letras[i], letras[j]] = [letras[j]!, letras[i]!]; }
  return letras.join("");
}
