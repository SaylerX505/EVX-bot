import { describe, expect, it } from 'vitest';
import { addDays, canTransition, formatMoney } from '../src/domain.js';

describe('order domain', () => {
  it('allows the intended lifecycle', () => {
    expect(canTransition('OPENED', 'CLAIMED')).toBe(true);
    expect(canTransition('CLAIMED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'CLOSED')).toBe(true);
    expect(canTransition('PROCESSING', 'CANCELLED')).toBe(true);
  });

  it('rejects invalid lifecycle transitions', () => {
    expect(canTransition('OPENED', 'CLOSED')).toBe(false);
    expect(canTransition('CLOSED', 'OPENED')).toBe(false);
    expect(canTransition('CANCELLED', 'PROCESSING')).toBe(false);
  });

  it('keeps retention at exactly thirty days', () => {
    const start = new Date('2026-10-08T00:00:00.000Z');
    expect(addDays(start, 30).toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('formats stored decimal money safely', () => {
    expect(formatMoney('12.5', 'USD')).toBe('$12.50');
    expect(formatMoney('12.5', 'USDT')).toBe('USDT 12.50');
  });
});
