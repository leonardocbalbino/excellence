import { cn } from '@/lib/utils';

/** Prédio dourado da logo num quadrado preto (mesmo desenho do ícone do app). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar p-1', className)}
      aria-hidden="true"
    >
      <img src="/brand/logo-mark.png" alt="" className="size-full object-contain" />
    </span>
  );
}

/** Logo completa (prédio + EXCELLENCE), para fundos escuros. */
export function BrandLogo({ className }: { className?: string }) {
  return <img src="/brand/logo.png" alt="Excellence" className={cn('object-contain', className)} />;
}
