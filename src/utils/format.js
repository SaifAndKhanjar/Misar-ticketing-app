export function formatTime(totalMinutes) {
  if (totalMinutes <= 0) return 'Now';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-OM', { hour: '2-digit', minute: '2-digit', hour12: true });
}
