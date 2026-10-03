import { HttpRequester } from '../core/requester.js';
import { AccountsService } from './accounts/service.js';
import { ChainService } from './chain/service.js';
import type { ClientOptions } from './types.js';

export abstract class BaseClient {
  public readonly baseUrl: URL;
  public readonly chain: ChainService;
  public readonly accounts: AccountsService;
  protected readonly options: ClientOptions;

  protected constructor(options: ClientOptions, token?: string) {
    this.options = { ...options, baseUrl: new URL(options.baseUrl) };
    const requester = new HttpRequester({ ...this.options, token });
    this.baseUrl = new URL(requester.baseUrl);
    this.chain = new ChainService(requester);
    this.accounts = new AccountsService(requester);
  }
}
