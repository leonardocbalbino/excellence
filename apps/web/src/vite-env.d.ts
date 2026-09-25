/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base da API. Padrão: "/api/v1" (mesma origem, via proxy no desenvolvimento). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
