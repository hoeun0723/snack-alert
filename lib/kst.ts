/**
 * KST(Asia/Seoul) 기준 날짜 계산.
 * 서버(Vercel = UTC)와 브라우저가 같은 "오늘"을 보도록 항상 KST로 계산합니다.
 */

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 오늘의 KST 날짜 키 (YYYY-MM-DD) */
export function kstDateKey(date: Date = new Date()): string {
  return dateKeyFormatter.format(date);
}

/** 날짜 키를 일 단위로 이동 (days 가 -1 이면 어제) */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return dateKey;
  }
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD 형태의 날짜 키인지 확인합니다.
 * (2026-13-45 처럼 형식만 맞고 없는 날짜는 걸러냅니다)
 */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** 날짜 키를 "11월 20일 금요일" 형태로 */
export function kstDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

/** ISO 시각을 "오후 3:24" 형태로 */
export function kstTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "방금", "3분 전" 같은 상대 시간 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 20) return "방금";
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
