import { address, type Address } from '@solana/kit';
import { badRequest } from '../../api/middleware/error.js';

export const U64_MAX = (1n << 64n) - 1n;
export const I64_MIN = -(1n << 63n);
export const I64_MAX = (1n << 63n) - 1n;

export function parseAddress(value: string): Address {
  try {
    return address(value);
  } catch {
    throw badRequest(`Invalid Solana address: ${value}`);
  }
}

export function parseU64(value: string, field: string): bigint {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) {
    throw badRequest(`${field} must be an unsigned integer string`);
  }
  const parsed = BigInt(value);
  if (parsed > U64_MAX) throw badRequest(`${field} exceeds u64 range`);
  return parsed;
}

export function parseI64(value: string, field: string): bigint {
  if (typeof value !== 'string' || !/^-?\d{1,19}$/.test(value)) {
    throw badRequest(`${field} must be an integer string`);
  }
  const parsed = BigInt(value);
  if (parsed < I64_MIN || parsed > I64_MAX) throw badRequest(`${field} exceeds i64 range`);
  return parsed;
}

export function pagination(limit = 50, offset = 0): { limit: number; offset: number } {
  if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) {
    throw badRequest('limit and offset must be safe integers');
  }
  return { limit: Math.min(Math.max(limit, 1), 200), offset: Math.max(offset, 0) };
}

export function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function queryPagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const parse = (value: unknown, fallback: number): number => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
      throw badRequest('limit and offset must be integer query values');
    }
    return Number(value);
  };
  return pagination(parse(query.limit, 50), parse(query.offset, 0));
}
