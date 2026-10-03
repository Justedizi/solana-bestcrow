export interface ClientOptions {
  /** Server origin, for example http://localhost:3001. */
  baseUrl: string | URL;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
