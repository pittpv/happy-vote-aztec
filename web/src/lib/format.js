export function shortAddr(value) {
  if (!value) return "";
  const s = String(value);
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}
