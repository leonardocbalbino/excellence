import { type ApiClient, ApiUnavailableError, type FilePurpose } from '@excellence/shared';

/**
 * Envia um arquivo direto ao storage (política de upload pré-assinada) e confirma na API.
 * Devolve o id do arquivo, pronto para ser referenciado (ex.: importação, atestado).
 */
export async function uploadFile(
  api: ApiClient,
  file: File,
  purpose: FilePurpose,
): Promise<string> {
  const ticket = await api.files.createUpload({
    purpose,
    fileName: file.name,
    // Navegadores às vezes não informam o tipo de CSV.
    contentType: file.type || (file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : ''),
    sizeBytes: file.size,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch(ticket.url, { method: 'POST', body: form });
  } catch (error) {
    throw new ApiUnavailableError('Não foi possível enviar o arquivo.', { cause: error });
  }
  if (!response.ok) throw new ApiUnavailableError('O armazenamento recusou o arquivo.');
  await api.files.confirm(ticket.fileId);
  return ticket.fileId;
}
