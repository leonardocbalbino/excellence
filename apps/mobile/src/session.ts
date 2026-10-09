import { ApiError, type AuthenticatedResponse, type AuthUser } from '@excellence/shared';
import * as SecureStore from 'expo-secure-store';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | {
      status: 'authenticated';
      /** Vazio no modo offline (app aberto sem conexão): renova no primeiro 401. */
      accessToken: string;
      user: AuthUser;
      offline: boolean;
    };

const REFRESH_KEY = 'excellence.refreshToken';
/** Dados básicos do usuário, para abrir o app sem conexão (e bater ponto offline). */
const USER_KEY = 'excellence.user';
/** Renova o access token um pouco antes de expirar. */
const REFRESH_MARGIN_SECONDS = 60;

export interface MobileSessionDependencies {
  refresh: (refreshToken: string) => Promise<AuthenticatedResponse>;
  logout: (refreshToken: string) => Promise<void>;
}

/**
 * Sessão no aparelho (ADR 0006, ADR 0019):
 * - o access token fica só em memória;
 * - o refresh token (rotativo, vale uma vez) fica no armazenamento seguro do sistema
 *   (Keychain no iOS, Keystore no Android) e é trocado a cada renovação;
 * - renovações simultâneas compartilham a mesma chamada.
 */
export class MobileSession {
  private state: SessionState = { status: 'loading' };
  private readonly listeners = new Set<() => void>();
  private refreshing: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: MobileSessionDependencies) {}

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  accessToken(): string | null {
    return this.state.status === 'authenticated' && this.state.accessToken
      ? this.state.accessToken
      : null;
  }

  /** Há refresh token guardado (a biometria pede confirmação antes de usar). */
  async hasStoredSession(): Promise<boolean> {
    return (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
  }

  async signIn(response: AuthenticatedResponse): Promise<void> {
    if (response.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_KEY, response.refreshToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user));
    this.set({
      status: 'authenticated',
      accessToken: response.accessToken,
      user: response.user,
      offline: false,
    });
    clearTimeout(this.timer);
    const delay = Math.max(response.expiresIn - REFRESH_MARGIN_SECONDS, 5) * 1000;
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  /**
   * Na abertura do app: retoma a sessão com o refresh token guardado. Sem conexão, abre em modo
   * offline com o último usuário (dá para registrar ponto e ronda na fila); a sessão é renovada
   * sozinha no primeiro pedido depois que a conexão volta.
   */
  async restore(): Promise<void> {
    if (await this.refresh()) return;
    if (this.state.status === 'anonymous') return; // sem token ou sessão revogada (401)
    const saved = await SecureStore.getItemAsync(USER_KEY);
    if (saved) {
      this.set({
        status: 'authenticated',
        accessToken: '',
        user: JSON.parse(saved) as AuthUser,
        offline: true,
      });
    } else {
      this.set({ status: 'anonymous' });
    }
  }

  refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const token = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!token) {
        this.set({ status: 'anonymous' });
        return false;
      }
      try {
        await this.signIn(await this.deps.refresh(token));
        return true;
      } catch (error) {
        // 401: sessão expirada ou revogada (ex.: MFA redefinido). Sem rede: mantém o estado.
        if (error instanceof ApiError && error.status === 401) await this.clear();
        return false;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    const token = await SecureStore.getItemAsync(REFRESH_KEY);
    if (token) await this.deps.logout(token).catch(() => undefined);
    await this.clear();
  }

  /** Esquece a sessão só neste aparelho (ex.: biometria recusada várias vezes). */
  async clear(): Promise<void> {
    clearTimeout(this.timer);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    this.set({ status: 'anonymous' });
  }

  private set(state: SessionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
