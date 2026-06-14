export function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(2)}`;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const cents = (p: number) => `${Math.round(p * 100)}¢`;

export function timeLeft(expiryMs: number, now: number = Date.now()): string {
  const d = expiryMs - now;
  if (d <= 0) return "expired";
  const days = Math.floor(d / 86_400_000);
  if (days >= 1) return `${days}d left`;
  const hrs = Math.floor(d / 3_600_000);
  if (hrs >= 1) return `${hrs}h left`;
  return `${Math.max(1, Math.floor(d / 60_000))}m left`;
}

export function shortAddr(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
