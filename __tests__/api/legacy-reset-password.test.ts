import { describe, it, expect } from 'vitest';
import { POST, GET } from '@/app/api/users/reset-password/route';

describe('legacy /api/users/reset-password (disabled)', () => {
  it('POST returns 403 and never resets a password', async () => {
    const res = await POST();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(String(json.message)).toMatch(/administrator/i);
  });

  it('GET is also disabled with 403', async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });
});