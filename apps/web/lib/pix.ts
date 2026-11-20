// PIX "copia e cola" (BR Code, padrão EMV do Banco Central) para PIX estático
// com valor e identificador do pedido. Confirmação do pagamento é manual (decisão #33).

/** Campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
function campo(id: string, valor: string) {
  const tam = valor.length.toString().padStart(2, "0");
  return `${id}${tam}${valor}`;
}

/** Remove acentos e caracteres fora do padrão (nome e cidade aceitam só ASCII). */
function limpar(texto: string, max: number) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .trim()
    .slice(0, max);
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63. */
export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function gerarPixCopiaECola(opts: {
  chave: string;
  nome: string;
  cidade: string;
  valorCentavos: number;
  identificador: string; // até 25 caracteres alfanuméricos
}) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", opts.chave.trim());
  const txid = opts.identificador.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (opts.valorCentavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(opts.nome, 25)) +
    campo("60", limpar(opts.cidade, 15)) +
    campo("62", campo("05", txid)) +
    "6304";
  return semCrc + crc16(semCrc);
}
