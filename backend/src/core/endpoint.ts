export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type AuthenticationRequirement = 'public' | 'optional' | 'required';

export interface EndpointDefinition<Params, Result> {
  readonly path: `api/${string}`;
  readonly method: HttpMethod;
  readonly auth: AuthenticationRequirement;
  readonly __types?: { readonly params: Params; readonly result: Result };
}

export interface EndpointParams {
  path?: object;
  query?: object;
  body?: unknown;
}

export type ParamsOf<Endpoint> = Endpoint extends EndpointDefinition<infer Params, unknown>
  ? Params
  : never;
export type ResultOf<Endpoint> = Endpoint extends EndpointDefinition<unknown, infer Result>
  ? Result
  : never;
