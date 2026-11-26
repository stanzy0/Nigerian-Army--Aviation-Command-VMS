import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

class FakeAudio {
  static instances: FakeAudio[] = [];
  volume = 1;
  loop = false;
  muted = false;
  preload = '';
  src = '';
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  private listeners: Record<string, Array<() => void>> = {};
  constructor(_src?: string) {
    FakeAudio.instances.push(this);
  }
  addEventListener = (t: string, cb: () => void) => {
    (this.listeners[t] ||= []).push(cb);
  };
  removeEventListener = (t: string, cb: () => void) => {
    this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== cb);
  };
}

import { BirthdayCelebration } from '@/components/birthday/BirthdayCelebration';

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('BirthdayCelebration music', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    stubMatchMedia();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plays the song once when a birthday is displayed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 'e1', full_name: 'Jane Doe', department: 'HQ', photo_url: null }],
        }),
      })
    );

    const { unmount } = render(<BirthdayCelebration refreshIntervalMs={999999} />);

    await waitFor(() => expect(FakeAudio.instances.length).toBe(1));
    const audio = FakeAudio.instances[0];
    expect(audio.volume).toBe(0.5);
    expect(audio.loop).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);

    unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.load).toHaveBeenCalled();
  });

  it('does not create audio when there are no birthdays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) })
    );

    render(<BirthdayCelebration refreshIntervalMs={999999} />);
    await waitFor(() => expect(FakeAudio.instances.length).toBe(0));
  });
});