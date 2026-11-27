import { describe, it, expect, vi, beforeEach } from 'vitest';

const BASE_URL = 'http://localhost:3000';

const { state, mockMaybeSingle } = vi.hoisted(() => ({
  state: { user: null as null | { id: string; user_metadata: Record<string, unknown> } },
  mockMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/demo', () => ({ isDemoMode: () => false }));
vi.mock('@/lib/startup-validation', () => ({ validateStartup: () => ({ passed: true, error: null }) }));

vi.mock('next/server', () => ({
  NextResponse: {
    next: (init?: { request?: unknown }) => ({
      kind: 'next',
      headers: new Headers(),
      cookies: { set: () => undefined },
      request: init?.request,
    }),
    redirect: (url: URL) => ({
      kind: 'redirect',
      status: 307,
      headers: new Headers({ location: url.toString() }),
      cookies: { set: () => undefined },
    }),
  },
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

import { updateSession } from '@/lib/supabase/middleware';

function req(path: string) {
  const url = new URL(path, BASE_URL);
  return {
    url: url.toString(),
    nextUrl: url,
    headers: new Headers(),
    cookies: { getAll: () => [] as Array<{ name: string; value: string }> },
  } as unknown as Parameters<typeof updateSession>[0];
}

describe('middleware must_change_password enforcement (DB flag)', () => {
  beforeEach(() => {
    state.user = { id: 'u1', user_metadata: {} };
    mockMaybeSingle.mockReset();
  });

  it('redirects to /change-password when the DB flag is true', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { must_change_password: true }, error: null });
    const res = await updateSession(req('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/change-password');
  });

  it('does not redirect when the DB flag is false', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { must_change_password: false }, error: null });
    const res = await updateSession(req('/dashboard'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not redirect on the change-password page itself (no loop)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { must_change_password: true }, error: null });
    const res = await updateSession(req('/change-password'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not redirect on the login page', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { must_change_password: true }, error: null });
    const res = await updateSession(req('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('uses the DB flag as authoritative over a stale metadata=true (no redirect)', async () => {
    state.user = { id: 'u1', user_metadata: { must_change_password: true } };
    mockMaybeSingle.mockResolvedValue({ data: { must_change_password: false }, error: null });
    const res = await updateSession(req('/visitors'));
    expect(res.headers.get('location')).toBeNull();
    expect(mockMaybeSingle).toHaveBeenCalled();
  });

  it('redirects when the DB flag is true even if metadata is false', async () => {
    state.user = { id: 'u1', user_metadata: {} };
    mockMaybeSingle.mockResolvedValue({ data: { must_change_password: true }, error: null });
    const res = await updateSession(req('/visitors'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/change-password');
  });

  it('falls back to metadata when no user_roles row exists', async () => {
    state.user = { id: 'u1', user_metadata: { must_change_password: true } };
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await updateSession(req('/visitors'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/change-password');
  });

  it('does not redirect unauthenticated users', async () => {
    state.user = null;
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await updateSession(req('/dashboard'));
    expect(res.headers.get('location')).toBeNull();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});