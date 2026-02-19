export function formatRelativeTime(timestamp: string, nowMs = Date.now()) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return "--";
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m ago`;
  }
  if (deltaSeconds < 86400) {
    return `${Math.floor(deltaSeconds / 3600)}h ago`;
  }
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}
