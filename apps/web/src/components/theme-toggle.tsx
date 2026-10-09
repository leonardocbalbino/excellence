import { useId } from 'react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { THEME_OPTIONS } from './theme-options';

/**
 * Escolha do tema: claro, escuro ou o do sistema. Rádios nativos (setas do teclado mudam a
 * opção); `tone` ajusta as cores para o menu lateral escuro.
 */
export function ThemeToggle({
  tone = 'default',
  className,
}: {
  tone?: 'default' | 'sidebar';
  className?: string;
}) {
  const { preference, setPreference } = useTheme();
  const name = useId();
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend
        className={cn(
          'mb-1.5 text-xs font-semibold',
          tone === 'sidebar' ? 'text-sidebar-muted' : 'text-muted-foreground',
        )}
      >
        Tema
      </legend>
      <div
        className={cn(
          'grid grid-cols-3 gap-1 rounded-lg p-1',
          tone === 'sidebar' ? 'bg-white/5' : 'bg-muted',
        )}
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const checked = preference === value;
          return (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                tone === 'sidebar'
                  ? checked
                    ? 'bg-sidebar-accent text-white'
                    : 'text-sidebar-foreground hover:bg-white/5'
                  : checked
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => setPreference(value)}
                className="sr-only"
              />
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
