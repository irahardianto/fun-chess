import { describe, it, expect, vi } from 'vitest';
import { SystemClock, MockClock, type IClock } from '../clock';

describe('SystemClock', () => {
  it('implements IClock interface and returns current timestamp from Date.now()', () => {
    const clock: IClock = new SystemClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('reflects mocked Date.now() correctly', () => {
    const clock: IClock = new SystemClock();
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    expect(clock.now()).toBe(1234567890);
    vi.restoreAllMocks();
  });
});

describe('MockClock (MIN-011)', () => {
  it('implements IClock interface with deterministic time control', () => {
    const clock: IClock = new MockClock(1000);
    expect(clock.now()).toBe(1000);

    const mock = clock as MockClock;
    mock.advance(500);
    expect(mock.now()).toBe(1500);

    mock.setTime(3000);
    expect(mock.now()).toBe(3000);

    mock.reset(0);
    expect(mock.now()).toBe(0);
  });
});
