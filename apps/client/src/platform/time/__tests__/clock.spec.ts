import { describe, it, expect, vi } from 'vitest';
import { SystemClock } from '../clock';

describe('SystemClock', () => {
  it('returns current timestamp from Date.now()', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('reflects mocked Date.now() correctly', () => {
    const clock = new SystemClock();
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    expect(clock.now()).toBe(1234567890);
    vi.restoreAllMocks();
  });
});
