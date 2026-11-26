import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost:3000';

const mockGetCurrentUser = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockFrom = vi.hoisted(() => vi.fn());
const mockIsDemoMode = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('@/lib/auth', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/demo', () => ({ isDemoMode: mockIsDemoMode }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom } }));

import { POST as postAudit } from '@/app/api/audit/route';

function makeRequest(body: unknown, raw?: string): NextRequest {
  return new NextRequest(new URL('/api/audit', BASE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

describe('POST /api/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDemoMode.mockReturnValue(false);
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it('records an event for an authenticated user (actor from session)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'jane@army.mil.ng', role: 'Admin' });

    const res = await postAudit(
      makeRequest({ action: 'Note Added', entityType: 'visitor', entityId: 'v1', details: 'hi', performed_by: 'attacker' })
    );
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.performed_by).toBe('jane@army.mil.ng'); // never the client value
    expect(row.action).toBe('Note Added');
    expect(row.entity_type).toBe('visitor');
    expect(row.entity_id).toBe('v1');
  });

  it('rejects unauthenticated requests (401) and does not insert', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await postAudit(makeRequest({ action: 'x' }));
    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a missing action (400)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'Admin' });
    const res = await postAudit(makeRequest({ details: 'no action' }));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON safely (400)', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'Admin' });
    const res = await postAudit(makeRequest(null, '{not json'));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('is a no-op in demo mode (200, no insert)', async () => {
    mockIsDemoMode.mockReturnValue(true);
    const res = await postAudit(makeRequest({ action: 'x' }));
    expect(res.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});