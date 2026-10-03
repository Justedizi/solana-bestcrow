import type { Router } from 'express';
import type { Store } from '../../db/index.js';
import { InstructionsEndpoints, InstructionsService } from '../../sectors/chain/index.js';

export function instructionsRouter(_store: Store): Router {
  return new InstructionsEndpoints(new InstructionsService()).router;
}
