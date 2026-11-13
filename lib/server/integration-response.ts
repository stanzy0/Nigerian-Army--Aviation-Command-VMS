import { NextResponse } from 'next/server';

export interface IntegrationResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
};

export interface RateLimitHeaders {
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in milliseconds
}

function buildRateLimitHeaders(rateLimit?: RateLimitHeaders): Record<string, string> {
  if (!rateLimit) return {};
  const resetSeconds = Math.ceil(rateLimit.resetTime / 1000);
  return {
    'X-RateLimit-Limit': rateLimit.limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, rateLimit.remaining).toString(),
    'X-RateLimit-Reset': resetSeconds.toString(),
  };
}

export function integrationResponse<T>(
  body: T,
  options: IntegrationResponseOptions = {}
): NextResponse {
  const { status = 200, headers = {} } = options;
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...headers,
    },
  });
}

export function integrationErrorResponse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        ...headers,
      },
    }
  );
}

export function integrationSuccessResponse<T>(
  data: T,
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  },
  rateLimit?: RateLimitHeaders
): NextResponse {
  const body = pagination
    ? { success: true, data, pagination }
    : { success: true, data };
  return NextResponse.json(body, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      ...buildRateLimitHeaders(rateLimit),
    },
  });
}

export function integrationRateLimitResponse(
  resetTime: number,
  limit: number,
  currentCount: number
): NextResponse {
  const remaining = Math.max(0, limit - currentCount);
  const resetSeconds = Math.ceil(resetTime / 1000);
  const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please try again later.',
      },
    },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetSeconds.toString(),
      },
    }
  );
}