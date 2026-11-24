import { isDateKey, kstDateKey } from "@/lib/kst";

/**
 * 사진 API 에서 쓰는 날짜 파라미터 (`?date=YYYY-MM-DD`).
 * - 없으면 오늘(KST) 날짜
 * - 형식이 틀리면 invalid (라우트에서 400 으로 돌려줍니다)
 */
export type DateParam = { date: string; invalid: false } | { date: null; invalid: true };

export function readDateParam(request: Request): DateParam {
  const raw = new URL(request.url).searchParams.get("date");
  if (raw === null || raw === "") return { date: kstDateKey(), invalid: false };
  if (!isDateKey(raw)) return { date: null, invalid: true };
  return { date: raw, invalid: false };
}

/**
 * 사진 응답 캐시 헤더.
 * ?v=등록시각 이 붙은 주소만 오래 캐시합니다. (사진이 바뀌면 주소도 바뀜)
 * 날짜를 지정해 과거 사진을 읽을 때도 같은 규칙을 씁니다.
 */
export function photoCacheHeaders(hasVersion: boolean): Record<string, string> {
  return {
    "Cache-Control": hasVersion ? "public, max-age=31536000, immutable" : "no-store, max-age=0",
  };
}
