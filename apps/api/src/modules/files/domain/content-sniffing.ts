/** Bytes iniciais lidos do storage para identificar o formato real do arquivo. */
export const SNIFF_BYTES = 32;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/**
 * Confere se os primeiros bytes do arquivo batem com o tipo declarado. O tipo declarado
 * pelo cliente é só metadado; isto impede, por exemplo, um executável enviado como PDF.
 */
export function matchesDeclaredType(contentType: string, bytes: Uint8Array): boolean {
  switch (contentType) {
    case 'application/pdf':
      return ascii(bytes, 0, 5) === '%PDF-';
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
    case 'image/heic':
      return (
        ascii(bytes, 4, 8) === 'ftyp' &&
        ['heic', 'heix', 'heif', 'mif1', 'msf1'].includes(ascii(bytes, 8, 12))
      );
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      // XLSX é um ZIP.
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case 'text/csv':
      // Texto: sem bytes nulos no início.
      return bytes.length > 0 && !bytes.includes(0);
    default:
      return false;
  }
}
