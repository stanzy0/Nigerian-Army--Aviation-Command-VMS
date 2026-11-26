import { describe, it, expect } from 'vitest';
import { formatActivityDetails } from '@/lib/dashboard/format';

describe('formatActivityDetails', () => {
  it('returns the message from a JSONB auth-details object', () => {
    expect(formatActivityDetails({ role: 'Admin', message: 'Successful login for jane' })).toBe(
      'Successful login for jane'
    );
  });

  it('falls back to role when message is absent', () => {
    expect(formatActivityDetails({ role: 'Receptionist' })).toBe('Receptionist');
  });

  it('passes through legacy string details', () => {
    expect(formatActivityDetails('Visitor checked in')).toBe('Visitor checked in');
  });

  it('returns empty string for null/undefined/unknown shapes', () => {
    expect(formatActivityDetails(null)).toBe('');
    expect(formatActivityDetails(undefined)).toBe('');
    expect(formatActivityDetails(42)).toBe('');
    expect(formatActivityDetails({ foo: 'bar' })).toBe('');
  });

  it('never returns an object (would crash React as a child)', () => {
    const result = formatActivityDetails({ role: 'Admin', message: 'x' });
    expect(typeof result).toBe('string');
  });
});