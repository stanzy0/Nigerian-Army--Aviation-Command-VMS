import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());
const mockUpdateEq = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { extractBearerToken, authenticateApiKey } from '@/lib/server/integration-auth';

const KEY_ROW = {
  id: 'key-1',
  name: 'Test Integration',
  key_hash: 'irrelevant-in-mock',
  scopes: ['visitors:read'],
  is_active: true,
  expires_at: null,
  revoked_at: null,
};

function chainWithKey(row: unknown, updateThen: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => unknown) {
  mockUpdateEq.mockReturnValue({ then: updateThen });
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    update: vi.fn().mockReturnValue({ eq: mockUpdateEq }),
  };
}

describe('extractBearerToken (case-insensitive scheme)', () => {
  it.each([
    ['Bearer abc123', 'abc123'],
    ['bearer abc123', 'abc123'],
    ['BEARER abc123', 'abc123'],
    ['BeArEr abc123', 'abc123'],
    ['  Bearer   abc123  ', 'abc123'],
  ])('extracts token from %p', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });

  it.each([
    ['Basic abc123'],
    ['Token abc123'],
    ['Bearer'],
    [''],
    [null],
  ])('returns null for non-Bearer/absent header %p', (header) => {
    expect(extractBearerToken(header as string | null)).toBeNull();
  });
});

describe('authenticateApiKey last_used_at telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates last_used_at after successful auth without storing the token', async () => {
    mockFrom.mockReturnValue(chainWithKey(KEY_ROW, (res) => res(undefined)));

    const result = await authenticateApiKey('naac_live_secrettoken', 'visitors:read');
    expect(result.authorized).toBe(true);

    // update called with only last_used_at (never the plaintext token / hash)
    const updateArg = (mockFrom.mock.results[0].value.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateArg).toEqual({ last_used_at: expect.any(String) });
    expect(JSON.stringify(updateArg)).not.toContain('naac_live_secrettoken');
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'key-1');
  });

  it('does not fail the request when the last_used_at update rejects', async () => {
    mockFrom.mockReturnValue(chainWithKey(KEY_ROW, (_res, rej) => rej(new Error('db down'))));

    const result = await authenticateApiKey('naac_live_secrettoken', 'visitors:read');
    expect(result.authorized).toBe(true);
    expect(result.status).toBe(200);
  });

  it('does not update last_used_at when auth fails (bad scope)', async () => {
    mockFrom.mockReturnValue(chainWithKey(KEY_ROW, (res) => res(undefined)));

    const result = await authenticateApiKey('naac_live_secrettoken', 'visits:read');
    expect(result.authorized).toBe(false);
    expect(result.status).toBe(403);
    const updateMock = (mockFrom.mock.results[0].value.update as ReturnType<typeof vi.fn>);
    expect(updateMock).not.toHaveBeenCalled();
  });
});