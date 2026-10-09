import { useSyncExternalStore } from 'react';

/**
 * Tema da interface. `system` segue o aparelho (e muda junto se o aparelho mudar). A escolha
 * fica no navegador (localStorage); o script do index.html aplica antes da primeira pintura,
 * para não piscar o tema errado. Mantenha os dois em sincronia (chave e cores).
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'excellence-theme';

/** Cor da barra do navegador/PWA em cada tema (fundo do cabeçalho). */
const THEME_COLORS: Record<Theme, string> = { light: '#0f5a52', dark: '#0f1614' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Armazenamento bloqueado (modo privado, política do navegador): segue o sistema.
    return 'system';
  }
}

/** Ausente no jsdom dos testes e em navegadores muito antigos. */
function darkQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY)
    : null;
}

function systemTheme(): Theme {
  return darkQuery()?.matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

function apply(preference: ThemePreference): void {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

// ─── Estado compartilhado (todas as telas veem a mesma escolha) ───────────────────

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readPreference();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
  apply(next);
  notify();
}

/**
 * Aplica o tema salvo e passa a acompanhar o aparelho quando a escolha é "sistema". Chamado
 * uma vez na inicialização do app.
 */
export function initTheme(): void {
  apply(preference);
  darkQuery()?.addEventListener('change', () => {
    if (preference === 'system') {
      apply('system');
      notify();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (next: ThemePreference) => void;
} {
  const current = useSyncExternalStore(
    subscribe,
    () => preference,
    () => 'system' as const,
  );
  return { preference: current, theme: resolveTheme(current), setPreference: setThemePreference };
}
