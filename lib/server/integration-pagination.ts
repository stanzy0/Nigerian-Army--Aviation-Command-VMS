import type { NextRequest } from 'next/server';

/**
 * Parsed and validated pagination parameters for the external integration API.
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Result of parsing pagination query parameters.
 * Either a valid { page, limit } or an { error } message for a 400 response.
 */
export type PaginationParseResult =
  | { ok: true; page: number; limit: number }
  | { ok: false; error: string };

/** Default page size when `limit` is omitted. */
export const DEFAULT_PAGE_LIMIT = 20;

/** Hard maximum page size (preserved from the original implementation). */
export const MAX_PAGE_LIMIT = 100;

/** Matches a non-negative integer string only (rejects NaN, Infinity, floats, signs, whitespace). */
const NON_NEGATIVE_INT = /^\d+$/;

/**
 * Validates and parses `page` and `limit` query parameters.
 *
 * Rules:
 *   - Omitted parameters fall back to page = 1, limit = 20 (unchanged default behaviour).
 *   - Non-numeric values are rejected.
 *   - Zero or negative page/limit values are rejected.
 *   - `limit` is clamped to MAX_PAGE_LIMIT (100) when larger.
 *   - NaN / Infinity can never be produced, so `.range()` always receives finite integers.
 *
 * @param searchParams - The request URL search parameters.
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParseResult {
  const pageRaw = searchParams.get('page');
  const limitRaw = searchParams.get('limit');

  let page = 1;
  let limit = DEFAULT_PAGE_LIMIT;

  if (pageRaw !== null) {
    if (!NON_NEGATIVE_INT.test(pageRaw)) {
      return { ok: false, error: 'Invalid page parameter: must be a positive integer' };
    }
    page = Number(pageRaw);
    if (!Number.isInteger(page) || page < 1) {
      return { ok: false, error: 'Invalid page parameter: must be a positive integer' };
    }
  }

  if (limitRaw !== null) {
    if (!NON_NEGATIVE_INT.test(limitRaw)) {
      return { ok: false, error: 'Invalid limit parameter: must be a positive integer' };
    }
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) {
      return { ok: false, error: 'Invalid limit parameter: must be a positive integer' };
    }
    if (limit > MAX_PAGE_LIMIT) {
      limit = MAX_PAGE_LIMIT;
    }
  }

  return { ok: true, page, limit };
}

/**
 * Convenience wrapper that reads `page`/`limit` directly from a NextRequest.
 */
export function parsePaginationFromRequest(request: NextRequest): PaginationParseResult {
  return parsePagination(new URL(request.url).searchParams);
}