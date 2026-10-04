import type { EndpointDefinition, EndpointParams } from './endpoint.js';

export interface RequestOptions<Params> {
  params?: Params;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RequesterOptions {
  baseUrl: string | URL;
  token?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface RequestExecutor {
  readonly baseUrl: URL;
  request<Params extends EndpointParams, Result>(
    endpoint: EndpointDefinition<Params, Result>,
    options?: RequestOptions<Params>,
  ): Promise<Result>;
}

export class ApiClientError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class ApiNetworkError extends Error {
  public constructor(
    public readonly path: string,
    public readonly reason: 'network' | 'timeout' | 'aborted',
    cause: unknown,
  ) {
    super(`Request to ${path} failed: ${reason}`, { cause });
    this.name = 'ApiNetworkError';
  }
}

export class HttpRequester implements RequestExecutor {
  public readonly baseUrl: URL;
  private readonly token?: string;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  public constructor(options: RequesterOptions) {
    this.baseUrl = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(this.baseUrl.protocol)) {
      throw new TypeError('The API base URL must use HTTP or HTTPS');
    }
    if (this.baseUrl.username || this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash) {
      throw new TypeError('The API base URL must not contain credentials, query parameters, or a fragment');
    }
    if (!this.baseUrl.pathname.endsWith('/')) this.baseUrl.pathname += '/';
    this.token = options.token;
    if (this.token !== undefined && (!this.token || /\s/.test(this.token))) {
      throw new TypeError('The session token must be nonempty and contain no whitespace');
    }
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.assertTimeout(this.timeoutMs);
  }

  public async request<Params extends EndpointParams, Result>(
    endpoint: EndpointDefinition<Params, Result>,
    options: RequestOptions<Params> = {},
  ): Promise<Result> {
    if (endpoint.auth === 'required' && !this.token) {
      throw new Error(`${endpoint.path} requires a session; use client.withSession(token)`);
    }
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    this.assertTimeout(timeoutMs);
    const path = endpoint.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_, key: string) => {
      const value = (options.params?.path as Record<string, unknown> | undefined)?.[key];
      if (typeof value !== 'string' || !value || value === '.' || value === '..') {
        throw new TypeError(`A nonempty path parameter '${key}' is required`);
      }
      return encodeURIComponent(value);
    });
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.params?.query ?? {})) {
      if (value === undefined || value === null) continue;
      if (!['string', 'number', 'boolean', 'bigint'].includes(typeof value)) {
        throw new TypeError(`Query parameter '${key}' must be a scalar value`);
      }
      url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ Accept: 'application/json' });
    if (endpoint.auth !== 'public' && this.token) headers.set('Authorization', `Bearer ${this.token}`);
    let body: string | undefined;
    if (options.params?.body !== undefined) {
      if (endpoint.method === 'GET') throw new TypeError('GET requests cannot have a JSON body');
      body = JSON.stringify(options.params.body);
      headers.set('Content-Type', 'application/json');
    }
    const controller = new AbortController();
    const abortFromCaller = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await this.fetchImplementation(url, {
        method: endpoint.method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        let payload: unknown = text;
        try { payload = text ? JSON.parse(text) : undefined; } catch { /* Preserve non-JSON errors. */ }
        const message = typeof payload === 'object' && payload !== null && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : `${endpoint.method} ${endpoint.path} failed with HTTP ${response.status}`;
        throw new ApiClientError(message, response.status, endpoint.path, payload);
      }
      return (text ? JSON.parse(text) : undefined) as Result;
    } catch (error) {
      if (error instanceof ApiClientError || (error instanceof SyntaxError && !controller.signal.aborted)) {
        throw error;
      }
      throw new ApiNetworkError(
        endpoint.path,
        timedOut ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network',
        error,
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private assertTimeout(timeoutMs: number): void {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive, finite number');
    }
  }
}
