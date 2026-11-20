/**
 * 배포된 웹사이트의 실제 주소(오리진)를 계산합니다.
 *
 * 우선순위
 * 1. `NEXT_PUBLIC_SITE_URL`          — 직접 지정한 대표 주소 (예: https://snack-alert.vercel.app)
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel 이 넣어주는 프로젝트 대표 도메인
 * 3. `VERCEL_URL`                    — 이번 배포(preview 포함)의 주소
 * 4. 요청 헤더 `x-forwarded-host` / `host` (+ `x-forwarded-proto`)
 * 5. 로컬 개발 기본값 http://localhost:3000
 *
 * 값은 `process.env[name]` 처럼 동적으로 읽습니다.
 * `NEXT_PUBLIC_*` 은 빌드할 때 문자열로 박히기 때문에 점 표기로 읽으면
 * 빌드 이후에 Vercel 설정에서 바꾼 값이 서버 코드에 반영되지 않습니다.
 */
const FALLBACK_SITE_URL = "http://localhost:3000";

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

/** "snack-alert.vercel.app/" 같은 값을 "https://snack-alert.vercel.app" 로 다듬습니다. */
function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** 콤마로 이어진 프록시 헤더에서 첫 값만, 없으면 빈 문자열 */
function firstHeaderValue(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0]?.trim() ?? "";
}

/**
 * 이 요청을 처리하는 배포본의 웹사이트 주소를 돌려줍니다.
 * request 를 넘기면 요청 헤더까지 사용해 주소를 추론합니다.
 */
export function resolveSiteUrl(request?: Request): string {
  const explicit = normalizeUrl(readEnv("NEXT_PUBLIC_SITE_URL"));
  if (explicit) return explicit;

  const production = normalizeUrl(readEnv("VERCEL_PROJECT_PRODUCTION_URL"));
  if (production) return production;

  const deployment = normalizeUrl(readEnv("VERCEL_URL"));
  if (deployment) return deployment;

  if (request) {
    const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ||
      firstHeaderValue(request.headers.get("host"));
    if (host) {
      const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
      const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) || (isLocal ? "http" : "https");
      return `${proto}://${host}`;
    }

    try {
      const origin = new URL(request.url).origin;
      if (origin && origin !== "null") return origin;
    } catch {
      // request.url 이 절대 주소가 아니면 아래 기본값으로 넘어갑니다.
    }
  }

  return FALLBACK_SITE_URL;
}

/**
 * 사진 미리보기 절대 주소.
 * photoVersion 이 있으면 캐시가 영구(immutable)인 주소가 되어 Teams 미리보기도 바로 갱신됩니다.
 */
export function photoPreviewUrl(siteUrl: string, photoVersion: string | null): string {
  const base = `${siteUrl.replace(/\/+$/, "")}/api/photo`;
  if (!photoVersion) return base;
  return `${base}?v=${encodeURIComponent(photoVersion)}`;
}

/** metadataBase 용. 값이 이상하면 로컬 기본값으로 물러섭니다. */
export function siteMetadataBase(): URL {
  try {
    return new URL(resolveSiteUrl());
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}
