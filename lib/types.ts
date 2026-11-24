/**
 * 오늘 간식 왔나요? 🍪 에서 함께 쓰는 타입 정의
 */

/** 저장소 종류. redis = 팀 전체 공유, memory = 이 서버 인스턴스에서만 유지되는 임시 저장 */
export type StorageMode = "redis" | "memory";

export const EMPTY_LABEL_MESSAGE = "도착하면 알려드릴게요";
export const MAX_LABEL_LENGTH = 60;
export const MAX_MEMO_LENGTH = 200;
/** 익명 한 줄 댓글 최대 글자 수 */
export const MAX_COMMENT_LENGTH = 200;
/** 하루에 남길 수 있는 댓글 수 (저장 용량·도배 방지) */
export const MAX_COMMENTS_PER_DAY = 50;
/** 하루에 올릴 수 있는 사진 수 */
export const MAX_PHOTOS_PER_DAY = 5;
/** 사진 한 장의 data URL 문자열 기준 상한 (약 300KB 이미지) */
export const MAX_PHOTO_DATA_URL_LENGTH = 400_000;
/** 사진 여러 장을 한 번에 올릴 때 요청 본문 상한 (Vercel 함수 본문 4.5MB 안쪽) */
export const MAX_PHOTO_BATCH_DATA_URL_LENGTH = 2_200_000;
/** 히스토리로 보여줄 최근 일수 (저장 기간도 같습니다) */
export const HISTORY_DAYS = 30;

/**
 * 하루치 간식 상태.
 *  - waiting  : 아직 안 왔어요 ⏳
 *  - arrived  : 도착했어요 🍪
 *  - sold_out : 다 떨어졌어요 💨
 */
export type SnackStatus = "waiting" | "arrived" | "sold_out";

export const SNACK_STATUSES: readonly SnackStatus[] = ["waiting", "arrived", "sold_out"];

export interface StatusMeta {
  emoji: string;
  /** 버튼·배지에 쓰는 이름 */
  label: string;
  /** 큰 카드에 쓰는 문구 */
  hero: string;
  /** 간식 이름이 비어 있을 때 대신 보여줄 문구 */
  emptyLabel: string;
}

export const STATUS_META: Record<SnackStatus, StatusMeta> = {
  waiting: {
    emoji: "⏳",
    label: "아직 안 왔어요",
    hero: "아직 안 왔어요",
    emptyLabel: EMPTY_LABEL_MESSAGE,
  },
  arrived: {
    emoji: "🍪",
    label: "도착했어요",
    hero: "도착했어요!",
    emptyLabel: "얼른 가서 드세요!",
  },
  sold_out: {
    emoji: "💨",
    label: "다 떨어졌어요",
    hero: "다 떨어졌어요",
    emptyLabel: "다음 간식은 언제 올까요?",
  },
};

export function isSnackStatus(value: unknown): value is SnackStatus {
  return value === "waiting" || value === "arrived" || value === "sold_out";
}

/**
 * 예전 `arrived` boolean 과 새 `status` 를 함께 받아 하나의 상태로 정리합니다.
 * status 가 있으면 그 값을, 없으면 arrived 로 waiting/arrived 를 정합니다.
 */
export function resolveStatus(value: { status?: unknown; arrived?: unknown }): SnackStatus {
  if (isSnackStatus(value.status)) return value.status;
  return value.arrived === true ? "arrived" : "waiting";
}

/** 간식에 남길 수 있는 반응 */
export type ReactionKey = "tasty" | "best" | "fire";

export const REACTION_KEYS: readonly ReactionKey[] = ["tasty", "best", "fire"];

export interface ReactionMeta {
  key: ReactionKey;
  emoji: string;
  label: string;
}

export const REACTIONS: readonly ReactionMeta[] = [
  { key: "tasty", emoji: "😋", label: "맛있어요" },
  { key: "best", emoji: "👍", label: "최고" },
  { key: "fire", emoji: "🔥", label: "순삭" },
];

export type Reactions = Record<ReactionKey, number>;

export function isReactionKey(value: unknown): value is ReactionKey {
  return value === "tasty" || value === "best" || value === "fire";
}

export function emptyReactions(): Reactions {
  return { tasty: 0, best: 0, fire: 0 };
}

/** 저장된 값을 안전하게 정리합니다. (음수·소수·문자열 제거) */
export function parseReactions(value: unknown): Reactions {
  const reactions = emptyReactions();
  if (!value || typeof value !== "object") return reactions;
  const raw = value as Record<string, unknown>;
  for (const key of REACTION_KEYS) {
    const count = raw[key];
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      reactions[key] = Math.floor(count);
    }
  }
  return reactions;
}

export function reactionTotal(reactions: Reactions): number {
  return REACTION_KEYS.reduce((sum, key) => sum + (reactions[key] ?? 0), 0);
}

/** 오늘 남긴 익명 한 줄 댓글 */
export interface DayComment {
  /** 댓글 id (삭제할 때 씁니다) */
  id: string;
  /** 댓글 내용 (익명 · 최대 MAX_COMMENT_LENGTH 자) */
  text: string;
  /** 작성 시각 (ISO) */
  createdAt: string;
}

/** 하루에 올린 사진 한 장의 정보 (사진 본문은 담지 않습니다) */
export interface DayPhotoMeta {
  /** 사진 id — /api/photo/{id} 로 받아옵니다 */
  id: string;
  /** 사진을 올린 시각 (ISO). 주소에 붙여 캐시를 무효화합니다 */
  updatedAt: string;
}

/** 저장된 댓글 값을 안전하게 정리합니다. (형식이 깨진 값은 버립니다) */
export function parseComments(value: unknown): DayComment[] {
  if (!Array.isArray(value)) return [];
  const comments: DayComment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) continue;
    const id = typeof raw.id === "string" && raw.id ? raw.id : `${comments.length}`;
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString();
    comments.push({ id, text: text.slice(0, MAX_COMMENT_LENGTH), createdAt });
    if (comments.length >= MAX_COMMENTS_PER_DAY) break;
  }
  return comments;
}

/** 저장된 사진 목록 값을 안전하게 정리합니다. */
export function parsePhotos(value: unknown): DayPhotoMeta[] {
  if (!Array.isArray(value)) return [];
  const photos: DayPhotoMeta[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString();
    photos.push({ id, updatedAt });
    if (photos.length >= MAX_PHOTOS_PER_DAY) break;
  }
  return photos;
}

/** 하루치 간식 상태 (사진 본문은 담지 않습니다) */
export interface DayView {
  /** KST 기준 날짜 키 (YYYY-MM-DD) */
  date: string;
  /** 상태: waiting ⏳ / arrived 🍪 / sold_out 💨 */
  status: SnackStatus;
  /** 예전 클라이언트 호환용: status === "arrived" 와 같은 값 */
  arrived: boolean;
  /** 간식 종류 (예: "마들렌 · 3층 탕비실") */
  label: string;
  /** 한 줄 메모 */
  memo: string;
  /** 마지막으로 누군가 상태를 바꾼 시각 (ISO). 아무도 건드리지 않았으면 null */
  updatedAt: string | null;
  /** 오늘 사진이 등록되어 있는지 (photos 가 한 장이라도 있으면 true) */
  hasPhoto: boolean;
  /** 사진 버전(마지막 사진 등록 시각). 이미지 캐시 무효화용 · 예전 단일 사진 호환 */
  photoVersion: string | null;
  /** 오늘 올린 사진 목록 (올린 순서). 본문은 /api/photo/{id} 로 받아옵니다 */
  photos: DayPhotoMeta[];
  /** 오늘 남긴 익명 한 줄 댓글 (작성 순서) */
  comments: DayComment[];
  /** 상태를 바꾼 횟수. 폴링에서 변경 감지에 사용 */
  revision: number;
  /** 팀원 반응 카운터 */
  reactions: Reactions;
  /** 품절 알림을 이미 보낸 시각 (하루 1회 제한). 보내지 않았으면 null */
  soldOutNotifiedAt: string | null;
}

/** GET /api/status 응답 */
export interface StatusResponse {
  today: DayView;
  /** 어제 기록 (없으면 null). 예전 화면과의 호환용 */
  yesterday: DayView | null;
  storageMode: StorageMode;
  /** 서버가 계산한 KST 날짜 키 */
  todayKey: string;
}

/** POST /api/status 요청 본문 */
export interface StatusUpdateBody {
  /** 새 상태. arrived 보다 우선합니다. */
  status?: SnackStatus;
  /** 예전 클라이언트 호환용. true = arrived, false = waiting */
  arrived?: boolean;
  label?: string;
  memo?: string;
  /** true 면 오늘 기록(상태·메모·사진·반응)을 모두 지웁니다 */
  reset?: boolean;
}

/** 히스토리에서 뽑아낸 인기 간식 */
export interface PopularSnack {
  label: string;
  /** 그 간식 이름으로 모은 반응 합계 */
  total: number;
  /** 가장 최근에 올라온 날짜 */
  date: string;
}

/** GET /api/history 응답 */
export interface HistoryResponse {
  /** 최신순, 기록이 있는 날만 */
  history: DayView[];
  /** 반응이 가장 많은 간식 (없으면 null) */
  popular: PopularSnack | null;
  storageMode: StorageMode;
  todayKey: string;
}

export function emptyDay(date: string): DayView {
  return {
    date,
    status: "waiting",
    arrived: false,
    label: "",
    memo: "",
    updatedAt: null,
    hasPhoto: false,
    photoVersion: null,
    photos: [],
    comments: [],
    revision: 0,
    reactions: emptyReactions(),
    soldOutNotifiedAt: null,
  };
}
