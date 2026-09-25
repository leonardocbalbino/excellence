import { ApiError } from '@excellence/shared';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/** Leva os erros por campo devolvidos pela API (RFC 7807) para o formulário. */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): void {
  if (!(error instanceof ApiError)) return;
  for (const [path, message] of Object.entries(error.fieldErrors)) {
    setError(path as Path<T>, { message });
  }
}
