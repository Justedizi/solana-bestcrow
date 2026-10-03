import { EventEmitter } from 'node:events';

export interface SyncEvent {
  type: 'sync';
  slot: number;
  campaigns: number;
  donors: number;
  events: number;
  at: number;
}

export const bus = new EventEmitter();
bus.setMaxListeners(100);
