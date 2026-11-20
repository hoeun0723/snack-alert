import { emptyDay, type DayView, type StorageMode } from "@/lib/types";

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

const DAY_TTL_SECONDS = 60 * 60 * 24 * 14; // 14일이면 "어제 기록"까지 충분합니다.
const STATUS_PREFIX = "snack:status:";
const PHOTO_PREFIX = "snack:photo:";

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

function photoKey(date: string): string {
  return `${PHOTO_PREFIX}${date}`;
}

function parseDay(raw: string, date: string): DayView {
  const fallback = emptyDay(date);
  try {
    const parsed = JSON.parse(raw) as Partial<DayView>;
    return {
      date,
      arrived: parsed.arrived === true,
      label: typeof parsed.label === "string" ? parsed.label : "",
      memo: typeof parsed.memo === "string" ? parsed.memo : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      hasPhoto: parsed.hasPhoto === true,
      photoVersion: typeof parsed.photoVersion === "string" ? parsed.photoVersion : null,
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
    };
  } catch {
    return fallback;
  }
}

export async function readDay(date: string): Promise<DayView | null> {
  const raw = await kvGet(statusKey(date));
  return raw ? parseDay(raw, date) : null;
}

export async function writeDay(day: DayView): Promise<void> {
  await kvSet(statusKey(day.date), JSON.stringify(day), DAY_TTL_SECONDS);
}

export async function clearDay(date: string): Promise<void> {
  await Promise.all([kvDelete(statusKey(date)), kvDelete(photoKey(date))]);
}

export async function readPhoto(date: string): Promise<StoredPhoto | null> {
  const raw = await kvGet(photoKey(date));
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

export async function writePhoto(date: string, photo: StoredPhoto): Promise<void> {
  await kvSet(photoKey(date), JSON.stringify(photo), DAY_TTL_SECONDS);
}

export async function deletePhoto(date: string): Promise<void> {
  await kvDelete(photoKey(date));
}
