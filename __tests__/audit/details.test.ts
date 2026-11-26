import { describe, it, expect } from 'vitest';
import { detailsToText, detailsToRole, formatDetailsDisplay } from '@/lib/audit/details';

describe('audit details JSONB compatibility', () => {
  it('returns string details unchanged', () => {
    expect(detailsToText('Visitor checked in')).toBe('Visitor checked in');
    expect(formatDetailsDisplay('Visitor checked in')).toBe('Visitor checked in');
  });

  it('extracts message and role from a JSONB object', () => {
    const details = { role: 'Admin', message: 'Successful login for jane' };
    expect(detailsToText(details)).toContain('Successful login for jane');
    expect(detailsToText(details)).toContain('Admin');
    expect(detailsToRole(details)).toBe('Admin');
    expect(formatDetailsDisplay(details)).toBe('Successful login for jane — Role: Admin');
  });

  it('handles a JSONB object with message only', () => {
    const details = { message: 'User logged out' };
    expect(detailsToText(details)).toBe('User logged out');
    expect(detailsToRole(details)).toBe('—');
    expect(formatDetailsDisplay(details)).toBe('User logged out');
  });

  it('returns empty string for null details', () => {
    expect(detailsToText(null)).toBe('');
    expect(formatDetailsDisplay(null)).toBe('—');
    expect(detailsToRole(null)).toBe('—');
  });

  it('returns empty string for undefined details', () => {
    expect(detailsToText(undefined)).toBe('');
    expect(formatDetailsDisplay(undefined)).toBe('—');
  });

  it('safely handles unexpected JSONB values without crashing', () => {
    expect(detailsToText(42)).toBe('42');
    expect(detailsToText(true)).toBe('true');
    expect(detailsToText({ foo: 'bar', count: 3 })).toContain('bar');
    expect(formatDetailsDisplay({ foo: 'bar' })).toBe('bar');
    expect(detailsToRole({ foo: 'bar' })).toBe('—');
  });

  it('search text includes the message (searchable)', () => {
    const text = detailsToText({ role: 'Admin', message: 'Successful login for jane' }).toLowerCase();
    expect(text.includes('jane')).toBe(true);
    expect(text.includes('successful login')).toBe(true);
  });

  it('search text includes the role (searchable)', () => {
    const text = detailsToText({ role: 'Receptionist', message: 'x' }).toLowerCase();
    expect(text.includes('receptionist')).toBe(true);
  });

  it('does not crash on mixed old (string) and new (object) records', () => {
    const records: unknown[] = [
      'legacy string details',
      { role: 'Admin', message: 'new object details' },
      null,
      undefined,
      123,
    ];
    for (const r of records) {
      const text = detailsToText(r).toLowerCase();
      expect(typeof text).toBe('string');
      expect(() => formatDetailsDisplay(r)).not.toThrow();
    }
  });
});