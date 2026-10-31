import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/components/theme-toggle';
import { setThemePreference, THEME_STORAGE_KEY } from './theme';

afterEach(() => {
  setThemePreference('system');
});

describe('Tema', () => {
  it('a escolha vale na hora, fica salva e "Sistema" volta a seguir o aparelho', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('radio', { name: 'Sistema' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    // O jsdom não informa preferência do aparelho: cai no claro.
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
