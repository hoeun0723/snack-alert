import { NextResponse } from "next/server";

import { isPushConfigured, pushPublicKey } from "@/lib/push";
import {
  countPushSubscriptions,
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/store";

/**
 * 휴대폰 알림 구독 API.
 *
 * - GET    : 알림 키 설정 여부 + 구독에 쓰는 공개 키 + 구독 기기 수
 * - POST   : 브라우저가 만든 구독(endpoint · keys)을 저장
 * - DELETE : endpoint 로 구독 해제
 *
 * VAPID 키가 아직 없어도 GET 은 항상 200 으로 `configured: false` 를 돌려줍니다.
 * (화면이 오류 없이 "관리자 알림 키 설정 대기 중" 안내를 보여 줄 수 있도록)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/** 브라우저 구독 주소·키의 현실적인 최대 길이 (비정상적으로 큰 본문 차단) */
const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_KEY_LENGTH = 256;

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
}

function isFilledString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

/** 요청 본문에서 쓸 수 있는 구독 정보만 뽑습니다. 형식이 안 맞으면 null */
function readSubscription(
  body: SubscriptionBody,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const endpoint = body.endpoint;
  if (!isFilledString(endpoint, MAX_ENDPOINT_LENGTH) || !endpoint.startsWith("https://")) {
    return null;
  }

  const keys = body.keys;
  if (!keys || typeof keys !== "object") return null;
  const p256dh = (keys as { p256dh?: unknown }).p256dh;
  const auth = (keys as { auth?: unknown }).auth;
  if (!isFilledString(p256dh, MAX_KEY_LENGTH) || !isFilledString(auth, MAX_KEY_LENGTH)) {
    return null;
  }

  return { endpoint, keys: { p256dh, auth } };
}

/** 알림 설정 상태 — 키가 없어도 200 으로 조용히 알려 줍니다. */
export async function GET() {
  const configured = isPushConfigured();

  let subscriberCount: number | undefined;
  try {
    subscriberCount = await countPushSubscriptions();
  } catch (error) {
    // 저장소가 잠깐 막혀도 화면은 열려야 하므로 기기 수만 생략합니다.
    console.error("[api/push/subscribe] 구독 수를 읽지 못했어요", error);
  }

  return NextResponse.json(
    {
      configured,
      publicKey: configured ? pushPublicKey() : null,
      subscriberCount,
    },
    { headers: NO_STORE },
  );
}

/** 이 기기의 알림 구독을 저장합니다. */
export async function POST(request: Request) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "관리자 알림 키가 아직 설정되지 않았어요." },
      { status: 503, headers: NO_STORE },
    );
  }

  let body: SubscriptionBody;
  try {
    body = (await request.json()) as SubscriptionBody;
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const subscription = readSubscription(body ?? {});
  if (!subscription) {
    return NextResponse.json(
      { error: "구독 정보가 올바르지 않아요." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await savePushSubscription(subscription);
    let subscriberCount: number | undefined;
    try {
      subscriberCount = await countPushSubscriptions();
    } catch {
      // 구독은 저장됐으므로 기기 수만 생략합니다.
    }
    return NextResponse.json({ ok: true, subscriberCount }, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/push/subscribe] 저장 실패", error);
    return NextResponse.json(
      { error: "알림 구독을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/** 이 기기의 알림 구독을 해제합니다. */
export async function DELETE(request: Request) {
  let body: SubscriptionBody;
  try {
    body = (await request.json()) as SubscriptionBody;
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const endpoint = (body ?? {}).endpoint;
  if (!isFilledString(endpoint, MAX_ENDPOINT_LENGTH)) {
    return NextResponse.json(
      { error: "해제할 구독 주소가 없어요." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await deletePushSubscription(endpoint);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/push/subscribe] 해제 실패", error);
    return NextResponse.json(
      { error: "알림 구독을 해제하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
