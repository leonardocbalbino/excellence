import { ApiError, ApiUnavailableError, type AuthenticatedResponse } from '@excellence/shared';
import { authenticated } from '@/test/server';
import { SessionStore } from './session';

function unauthorized() {
  return new ApiError({
    type: 'urn:excellence:problem:invalid-refresh-token',
    title: 'x',
    status: 401,
  });
}

function createStore(overrides: Partial<ConstructorParameters<typeof SessionStore>[0]> = {}) {
  const refresh = vi.fn<() => Promise<AuthenticatedResponse>>(() =>
    Promise.resolve(authenticated()),
  );
  const logout = vi.fn(() => Promise.resolve());
  const store = new SessionStore({ refresh, logout, ...overrides });
  onTestFinished(() => store.dispose());
  return { store, refresh, logout };
}

describe('SessionStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('começa carregando e retoma a sessão pelo cookie', async () => {
    const { store } = createStore();
    expect(store.getState().status).toBe('loading');
    await store.restore();
    expect(store.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'access-token',
    });
    expect(store.accessToken()).toBe('access-token');
  });

  it('sem cookie válido fica anônimo', async () => {
    const { store } = createStore({ refresh: () => Promise.reject(unauthorized()) });
    await store.restore();
    expect(store.getState().status).toBe('anonymous');
  });

  it('chamadas simultâneas de refresh compartilham uma única renovação', async () => {
    const { store, refresh } = createStore();
    const results = await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
    expect(results).toEqual([true, true, true]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('serializa a renovação entre abas com Web Locks', async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    const { store } = createStore({ locks: { request } as unknown as LockManager });
    await store.refresh();
    expect(request).toHaveBeenCalledWith('excellence-auth-refresh', expect.any(Function));
  });

  it('falha de rede não derruba a sessão atual', async () => {
    const refresh = vi
      .fn<() => Promise<AuthenticatedResponse>>()
      .mockResolvedValueOnce(authenticated())
      .mockRejectedValueOnce(new ApiUnavailableError('offline'));
    const { store } = createStore({ refresh });
    await store.refresh();
    await expect(store.refresh()).resolves.toBe(false);
    expect(store.getState().status).toBe('authenticated');
  });

  it('renova antes de o access token expirar', async () => {
    vi.useFakeTimers();
    const { store, refresh } = createStore();
    store.signIn(authenticated());
    await vi.advanceTimersByTimeAsync((900 - 61) * 1000);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('logout encerra a sessão e avisa as outras abas', async () => {
    const postMessage = vi.fn();
    const { store, logout } = createStore({
      channel: { postMessage, addEventListener: vi.fn(), close: vi.fn() },
    });
    store.signIn(authenticated());
    await store.signOut();
    expect(logout).toHaveBeenCalledOnce();
    expect(store.getState().status).toBe('anonymous');
    expect(postMessage).toHaveBeenCalledWith('signed-out');
  });

  it('logout feito em outra aba encerra esta', () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const { store } = createStore({
      channel: {
        postMessage: vi.fn(),
        close: vi.fn(),
        addEventListener: ((_type: string, fn: (event: MessageEvent) => void) => {
          listener = fn;
        }) as BroadcastChannel['addEventListener'],
      },
    });
    store.signIn(authenticated());
    listener?.(new MessageEvent('message', { data: 'signed-out' }));
    expect(store.getState().status).toBe('anonymous');
  });

  it('notifica quem está inscrito', async () => {
    const { store } = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.restore();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
