/**
 * Destino depois do login. Só aceita caminhos internos, para o parâmetro `next` não virar
 * redirecionamento para outro site (`//evil.com`, `https://…`, `/\evil.com`).
 */
export function safeNext(next: string | null): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
