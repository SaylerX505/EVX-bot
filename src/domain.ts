export const ORDER_STATUSES = ['OPENED', 'CLAIMED', 'PROCESSING', 'CLOSED', 'CANCELLED'] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  OPENED: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error('Invalid order transition: ' + from + ' -> ' + to);
  }
}

export function statusLabel(status: OrderStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatMoney(value: string, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return currency + ' ' + value;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return currency + ' ' + n.toFixed(2);
  }
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export const retentionDate = addDays;
