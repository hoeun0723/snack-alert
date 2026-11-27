import { sendNotification, type PushSubscription as WebPushSubscription } from "web-push";

import {
  deletePushSubscription,
  listPushSubscriptions,
  type StoredPushSubscription,
} from "@/lib/store";
import type { DayView } from "@/lib/types";

/**
 * 휴대폰 백그라운드 알림(Web Push).
 *
 * - Vercel 환경변수에 VAPID 키가 없으면 아무 일도 하지 않습니다. (사이트·/api/status 는 그대로 동작)
 * - 키가 있어도 푸시 발송 실패가 간식 상태 저장을 막지 않도록 조용히 로그만 남깁니다.
 */

/** VAPID_SUBJECT 기본값 (선택 환경변수) */
export const DEFAULT_VAPID_SUBJECT = "mailto:snack-alert@example.com";

/** 알림이 늦게 도착해도 의미 없는 시간이 지나면 버리도록 하는 보관 시간 (초) */
const PUSH_TTL_SECONDS = 60 * 60 * 6;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** VAPID 키 환경변수를 읽습니다. 둘 중 하나라도 비어 있으면 null (알림 미설정 상태) */
export function vapidConfig(): VapidConfig | null {
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return null;

  const subject = (process.env.VAPID_SUBJECT ?? "").trim() || DEFAULT_VAPID_SUBJECT;
  return { publicKey, privateKey, subject };
}

/** 알림을 보낼 준비가 되었는지 (환경변수 기준) */
export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

/** 브라우저가 구독할 때 쓰는 공개 키 (미설정이면 null) */
export function pushPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

export interface PushDeliveryResult {
  /** 저장된 구독 수 */
  subscribers: number;
  sent: number;
  failed: number;
  /** 만료(404·410)되어 저장소에서 지운 구독 수 */
  removed: number;
}

const EMPTY_RESULT: PushDeliveryResult = { subscribers: 0, sent: 0, failed: 0, removed: 0 };

/** 푸시 서비스가 알려 준 HTTP 상태 코드 (web-push 오류에서 꺼내기) */
function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : null;
}

function toWebPushSubscription(subscription: StoredPushSubscription): WebPushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  };
}

/**
 * 간식이 도착한 순간, 저장된 모든 구독자에게 휴대폰 알림을 보냅니다.
 * 만료된 구독(404/410)은 저장소에서 지워 다음 발송을 가볍게 만듭니다.
 */
export async function sendArrivalPush(day: DayView): Promise<PushDeliveryResult> {
  const config = vapidConfig();
  if (!config) return EMPTY_RESULT;

  let subscriptions: StoredPushSubscription[];
  try {
    subscriptions = await listPushSubscriptions();
  } catch (error) {
    console.error("[push] 구독 목록을 읽지 못했어요", error);
    return EMPTY_RESULT;
  }
  if (subscriptions.length === 0) return EMPTY_RESULT;

  const body = day.label.trim() || "지금 탕비실로 가보세요!";
  const payload = JSON.stringify({
    title: "🍪 간식이 도착했어요!",
    body,
    url: "/",
    tag: "snack-arrival",
    icon: "/icon-192.png",
  });

  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      sendNotification(toWebPushSubscription(subscription), payload, {
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
        TTL: PUSH_TTL_SECONDS,
        urgency: "high",
        timeout: 5_000,
      }),
    ),
  );

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const expired: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sent += 1;
      return;
    }

    failed += 1;
    const status = statusOf(result.reason);
    const endpoint = subscriptions[index]?.endpoint;
    // 404(없는 구독) · 410(만료) 이면 다시는 보낼 수 없으니 정리합니다.
    if (endpoint && (status === 404 || status === 410)) expired.push(endpoint);

    console.error(
      "[push] 발송 실패",
      status ?? "-",
      result.reason instanceof Error ? result.reason.message : result.reason,
    );
  });

  if (expired.length > 0) {
    // 한 건이 실패해도 나머지 정리는 계속합니다.
    const cleanup = await Promise.allSettled(
      expired.map((endpoint) => deletePushSubscription(endpoint)),
    );
    removed = cleanup.filter((item) => item.status === "fulfilled").length;
  }

  return { subscribers: subscriptions.length, sent, failed, removed };
}
