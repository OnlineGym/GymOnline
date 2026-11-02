// Tự phát hiện thiết bị cảm ứng / mobile để hiển thị đúng giao diện điều khiển
let cached = null;

export function isMobile() {
  if (cached !== null) return cached;
  const ua = navigator.userAgent || '';
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  // iPadOS báo là Mac nhưng có cảm ứng
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  cached = uaMobile || iPadOS || (coarse && !window.matchMedia?.('(pointer: fine)').matches);
  return cached;
}
