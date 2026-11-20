/**
 * 오늘 간식 왔나요? 🍪 에서 함께 쓰는 타입 정의
 */

/** 저장소 종류. redis = 팀 전체 공유, memory = 이 서버 인스턴스에서만 유지되는 임시 저장 */
export type StorageMode = "redis" | "memory";

/** 하루치 간식 상태 (사진 본문은 담지 않습니다) */
export interface DayView {
  /** KST 기준 날짜 키 (YYYY-MM-DD) */
  date: string;
  /** 도착 여부: true = 도착했어요 🍪 / false = 아직 안 왔어요 ⏳ */
  arrived: boolean;
  /** 간식 종류 (예: "마들렌 · 3층 탕비실") */
  label: string;
  /** 한 줄 메모 */
  memo: string;
  /** 마지막으로 누군가 상태를 바꾼 시각 (ISO). 아무도 건드리지 않았으면 null */
  updatedAt: string | null;
  /** 오늘 사진이 등록되어 있는지 */
  hasPhoto: boolean;
  /** 사진 버전(등록 시각). 이미지 캐시 무효화용 */
  photoVersion: string | null;
  /** 상태를 바꾼 횟수. 폴링에서 변경 감지에 사용 */
  revision: number;
}

/** GET /api/status 응답 */
export interface StatusResponse {
  today: DayView;
  /** 어제 기록 (없으면 null) */
  yesterday: DayView | null;
  storageMode: StorageMode;
  /** 서버가 계산한 KST 날짜 키 */
  todayKey: string;
}

/** POST /api/status 요청 본문 */
export interface StatusUpdateBody {
  arrived?: boolean;
  label?: string;
  memo?: string;
  /** true 면 오늘 기록(상태·메모·사진)을 모두 지웁니다 */
  reset?: boolean;
}

export const EMPTY_LABEL_MESSAGE = "도착하면 알려드릴게요";
export const MAX_LABEL_LENGTH = 60;
export const MAX_MEMO_LENGTH = 200;
/** data URL 문자열 기준 상한 (약 300KB 이미지) */
export const MAX_PHOTO_DATA_URL_LENGTH = 400_000;

export function emptyDay(date: string): DayView {
  return {
    date,
    arrived: false,
    label: "",
    memo: "",
    updatedAt: null,
    hasPhoto: false,
    photoVersion: null,
    revision: 0,
  };
}
