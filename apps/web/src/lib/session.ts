import { ApiError, type AuthenticatedResponse, type AuthUser } from '@excellence/shared';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; accessToken: string; user: AuthUser };

export interface SessionDependencies {
  /** Troca o cookie httpOnly do refresh token por uma sessão nova. */
  refresh: () => Promise<AuthenticatedResponse>;
  logout: () => Promise<void>;
  /** Web Locks API (serializa o refresh entre abas); ausente em ambientes sem suporte. */
  locks?: Pick<LockManager, 'request'> | undefined;
  /** Canal entre abas para propagar o logout. */
  channel?: Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'> | undefined;
}

const LOCK_NAME = 'excellence-auth-refresh';
/** Renova o access token um pouco antes de expirar. */
const REFRESH_MARGIN_SECONDS = 60;

/**
 * Sessão do usuário no navegador (ADR 0006):
 * - o access token fica só em memória (nunca em localStorage);
 * - o refresh token é um cookie httpOnly, que o JavaScript não lê;
 * - cada refresh token vale uma vez, então a renovação é serializada entre abas (Web Locks)
 *   e deduplicada dentro da aba;
 * - o logout numa aba encerra as demais (BroadcastChannel).
 */
export class SessionStore {
  private state: SessionState = { status: 'loading' };
  private readonly listeners = new Set<() => void>();
  private refreshing: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: SessionDependencies) {
    deps.channel?.addEventListener('message', (event: MessageEvent) => {
      if (event.data === 'signed-out') this.clear();
    });
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  accessToken(): string | null {
    return this.state.status === 'authenticated' ? this.state.accessToken : null;
  }

  signIn(response: Pick<AuthenticatedResponse, 'accessToken' | 'expiresIn' | 'user'>): void {
    this.set({ status: 'authenticated', accessToken: response.accessToken, user: response.user });
    clearTimeout(this.timer);
    const delay = Math.max(response.expiresIn - REFRESH_MARGIN_SECONDS, 5) * 1000;
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  /** Na abertura do app: tenta retomar a sessão pelo cookie. */
  async restore(): Promise<void> {
    if (!(await this.refresh())) this.clear();
  }

  /** Renova a sessão. Chamadas simultâneas compartilham a mesma renovação. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.withLock(async () => {
      try {
        this.signIn(await this.deps.refresh());
        return true;
      } catch (error) {
        // 401: sessão expirada ou revogada. Outros erros (rede): mantém o estado atual.
        if (error instanceof ApiError && error.status === 401) this.clear();
        return false;
      }
    }).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    try {
      await this.deps.logout();
    } finally {
      this.clear();
      this.deps.channel?.postMessage('signed-out');
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.deps.channel?.close();
  }

  private clear(): void {
    clearTimeout(this.timer);
    this.set({ status: 'anonymous' });
  }

  private set(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = this.deps.locks;
    return locks ? locks.request(LOCK_NAME, fn) : fn();
  }
}
