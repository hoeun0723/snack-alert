import {
  emptyDay,
  HISTORY_DAYS,
  MAX_PHOTOS_PER_DAY,
  parseComments,
  parsePhotos,
  parseReactions,
  resolveStatus,
  type DayView,
  type StorageMode,
} from "@/lib/types";

/**
 * 저장소 계층.
 *
 * 1순위: Upstash Redis REST (Vercel Storage 에서 무료로 연결)
 *   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   - KV_REST_API_URL / KV_REST_API_TOKEN  (Vercel 통합 이름)
 * 2순위: 프로세스 메모리 (로컬 개발용, Vercel 환경변수 미설정 시)
 *
 * Redis REST 는 SDK 없이 fetch 만으로 동작합니다. (외부 의존성 0)
 */

// 히스토리로 보여주는 만큼(30일) 보관합니다.
const DAY_TTL_SECONDS = 60 * 60 * 24 * HISTORY_DAYS;
const STATUS_PREFIX = "snack:status:";
const PHOTO_PREFIX = "snack:photo:";

/**
 * 예전 단일 사진은 `snack:photo:{날짜}` 키에 그대로 두고,
 * 이 id 로 가리킵니다. (과거 데이터·이전 화면과의 하위 호환)
 */
export const LEGACY_PHOTO_ID = "legacy";

export interface StoredPhoto {
  type: string;
  /** base64 (data URL 접두사 제외) */
  data: string;
  updatedAt: string;
}

interface RedisConfig {
  url: string;
  token: string;
}

let cachedConfig: RedisConfig | null | undefined;

function redisConfig(): RedisConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "").trim();
  cachedConfig = url && token ? { url, token } : null;
  return cachedConfig;
}

export function storageMode(): StorageMode {
  return redisConfig() ? "redis" : "memory";
}

/** Redis REST 명령을 한 번 실행합니다. (예: ["GET", "key"]) */
async function command<T>(args: Array<string | number>): Promise<T> {
  const config = redisConfig();
  if (!config) throw new Error("redis-not-configured");

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Upstash ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) throw new Error(`Upstash: ${payload.error}`);
  return payload.result as T;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

function memoryStore(): Map<string, MemoryEntry> {
  const holder = globalThis as typeof globalThis & { __snackAlertMemory?: Map<string, MemoryEntry> };
  if (!holder.__snackAlertMemory) holder.__snackAlertMemory = new Map();
  return holder.__snackAlertMemory;
}

async function kvGet(key: string): Promise<string | null> {
  if (!redisConfig()) {
    const entry = memoryStore().get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      memoryStore().delete(key);
      return null;
    }
    return entry.value;
  }
  return (await command<string | null>(["GET", key])) ?? null;
}

async function kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!redisConfig()) {
    memoryStore().set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  await command(["SET", key, value, "EX", ttlSeconds]);
}

async function kvDelete(key: string): Promise<void> {
  if (!redisConfig()) {
    memoryStore().delete(key);
    return;
  }
  await command(["DEL", key]);
}

function statusKey(date: string): string {
  return `${STATUS_PREFIX}${date}`;
}

function photoKey(date: string, id: string): string {
  // 예전 단일 사진 키(`snack:photo:{날짜}`)와 새 사진 키(`snack:photo:{날짜}:{id}`)를 구분합니다.
  return id === LEGACY_PHOTO_ID ? `${PHOTO_PREFIX}${date}` : `${PHOTO_PREFIX}${date}:${id}`;
}

function parseDay(raw: string, date: string): DayView {
  const fallback = emptyDay(date);
  try {
    const parsed = JSON.parse(raw) as Partial<DayView>;
    const status = resolveStatus(parsed);
    const photoVersion = typeof parsed.photoVersion === "string" ? parsed.photoVersion : null;

    // 사진 목록이 없는 과거 데이터: 예전 단일 사진이 있으면 한 장짜리 목록으로 읽어 줍니다.
    let photos = parsePhotos(parsed.photos);
    if (photos.length === 0 && parsed.hasPhoto === true) {
      photos = [{ id: LEGACY_PHOTO_ID, updatedAt: photoVersion ?? new Date(0).toISOString() }];
    }

    return {
      date,
      status,
      arrived: status === "arrived",
      label: typeof parsed.label === "string" ? parsed.label : "",
      memo: typeof parsed.memo === "string" ? parsed.memo : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      hasPhoto: photos.length > 0,
      photoVersion: photos.length > 0 ? (photos.at(-1)?.updatedAt ?? photoVersion) : photoVersion,
      photos,
      comments: parseComments(parsed.comments),
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      reactions: parseReactions(parsed.reactions),
      soldOutNotifiedAt:
        typeof parsed.soldOutNotifiedAt === "string" ? parsed.soldOutNotifiedAt : null,
    };
  } catch {
    return fallback;
  }
}

export async function readDay(date: string): Promise<DayView | null> {
  const raw = await kvGet(statusKey(date));
  return raw ? parseDay(raw, date) : null;
}

/**
 * 여러 날짜를 한 번에 읽습니다. (히스토리용)
 * Redis 에서는 MGET 한 번으로 처리해서 무료 명령 한도를 아낍니다.
 * 요청한 순서를 그대로 지키고, 없는 날짜는 결과에서 빠집니다.
 */
export async function readDays(dates: string[]): Promise<DayView[]> {
  if (dates.length === 0) return [];

  if (!redisConfig()) {
    const days: DayView[] = [];
    for (const date of dates) {
      const raw = await kvGet(statusKey(date));
      if (raw) days.push(parseDay(raw, date));
    }
    return days;
  }

  const values = await command<(string | null)[]>(["MGET", ...dates.map(statusKey)]);
  const days: DayView[] = [];
  dates.forEach((date, index) => {
    const raw = values?.[index];
    if (typeof raw === "string" && raw) days.push(parseDay(raw, date));
  });
  return days;
}

export async function writeDay(day: DayView): Promise<void> {
  await kvSet(statusKey(day.date), JSON.stringify(day), DAY_TTL_SECONDS);
}

export async function clearDay(date: string): Promise<void> {
  // 사진은 본문 키가 따로 있어서, 날짜 기록을 읽어 목록의 사진 키까지 함께 지웁니다.
  const day = await readDay(date);
  const photoIds = new Set<string>(day?.photos.map((photo) => photo.id) ?? []);
  photoIds.add(LEGACY_PHOTO_ID);
  await Promise.all([
    kvDelete(statusKey(date)),
    ...[...photoIds].map((id) => kvDelete(photoKey(date, id))),
  ]);
}

/** 예전 단일 사진(레거시 키)을 읽습니다. */
export async function readPhoto(date: string): Promise<StoredPhoto | null> {
  return readPhotoById(date, LEGACY_PHOTO_ID);
}

/** 사진 한 장을 id 로 읽습니다. */
export async function readPhotoById(date: string, id: string): Promise<StoredPhoto | null> {
  const raw = await kvGet(photoKey(date, id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPhoto>;
    if (typeof parsed.data !== "string" || !parsed.data) return null;
    return {
      type: typeof parsed.type === "string" ? parsed.type : "image/jpeg",
      data: parsed.data,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** 예전 단일 사진 자리에 저장합니다. */
export async function writePhoto(date: string, photo: StoredPhoto): Promise<void> {
  return writePhotoById(date, LEGACY_PHOTO_ID, photo);
}

export async function writePhotoById(date: string, id: string, photo: StoredPhoto): Promise<void> {
  await kvSet(photoKey(date, id), JSON.stringify(photo), DAY_TTL_SECONDS);
}

export async function deletePhotoById(date: string, id: string): Promise<void> {
  await kvDelete(photoKey(date, id));
}

/** 날짜의 사진을 모두 지웁니다. (목록에 없는 옛 키까지 함께) */
export async function deleteAllPhotos(date: string): Promise<void> {
  const day = await readDay(date);
  const photoIds = new Set<string>(day?.photos.map((photo) => photo.id) ?? []);
  photoIds.add(LEGACY_PHOTO_ID);
  await Promise.all([...photoIds].map((id) => kvDelete(photoKey(date, id))));
}

/** 지금까지 올라온 사진 수 + 새로 올릴 수를 보고 남은 자리를 돌려줍니다. */
export function remainingPhotoSlots(day: DayView | null): number {
  const used = day?.photos.length ?? 0;
  return Math.max(0, MAX_PHOTOS_PER_DAY - used);
}
