export const payrollQueryKey = ['payroll-periods'] as const;
export const myPayrollQueryKey = ['me', 'payroll-previews'] as const;

/** Baixa um texto como arquivo (o CSV da contabilidade, com BOM para o Excel). */
export function downloadText(content: string, fileName: string, type: string): void {
  const text = content.startsWith('\uFEFF') ? content : `\uFEFF${content}`;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
