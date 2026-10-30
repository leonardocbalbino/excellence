import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render-app';

describe('Política de privacidade', () => {
  it('abre sem login (endereço público para as lojas de apps)', async () => {
    renderApp('/privacidade');
    expect(
      await screen.findByRole('heading', { name: 'Política de privacidade' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '7. Seus direitos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });
});
