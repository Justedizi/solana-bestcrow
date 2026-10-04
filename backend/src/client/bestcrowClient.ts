import { BaseClient } from './baseClient.js';
import type { ClientOptions } from './types.js';

export class BestcrowClient extends BaseClient {
  public constructor(options: ClientOptions, token?: string) {
    super(options, token);
  }

  public withSession(token: string): BestcrowClient {
    return new BestcrowClient(this.options, token);
  }
}
