import { NextResponse } from "next/server";

import { kstDateKey, shiftDateKey } from "@/lib/kst";
import { sendArrivalPush } from "@/lib/push";
import { clearDay, readDay, storageMode, writeDay } from "@/lib/store";
import { notifyTeams } from "@/lib/teams";
import {
  emptyDay,
  isSnackStatus,
  MAX_LABEL_LENGTH,
  MAX_MEMO_LENGTH,
  type DayView,
  type SnackStatus,
  type StatusResponse,
  type StatusUpdateBody,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/** 요청 본문에서 바꾸려는 상태를 뽑습니다. (status 우선, 없으면 arrived 호환) */
function requestedStatus(body: StatusUpdateBody): SnackStatus | null {
  if (body.status !== undefined) {
    return isSnackStatus(body.status) ? body.status : null;
  }
  if (typeof body.arrived === "boolean") {
    return body.arrived ? "arrived" : "waiting";
  }
  return null;
}

/** 오늘(과 어제)의 간식 상태를 돌려줍니다. */
export async function GET() {
  const todayKey = kstDateKey();

  try {
    const [today, yesterday] = await Promise.all([
      readDay(todayKey),
      readDay(shiftDateKey(todayKey, -1)),
    ]);

    const body: StatusResponse = {
      today: today ?? emptyDay(todayKey),
      yesterday: yesterday?.updatedAt ? yesterday : null,
      storageMode: storageMode(),
      todayKey,
    };

    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/status] read failed", error);
    return NextResponse.json(
      { error: "저장소에 연결하지 못했어요. 잠시 후 자동으로 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/**
 * 오늘 상태를 바꿉니다.
 * body: { status?: "waiting" | "arrived" | "sold_out", arrived?: boolean, label?: string, memo?: string, reset?: true }
 */
export async function POST(request: Request) {
  let body: StatusUpdateBody;
  try {
    body = (await request.json()) as StatusUpdateBody;
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const todayKey = kstDateKey();

  try {
    if (body.reset === true) {
      await clearDay(todayKey);
      return NextResponse.json(
        { today: emptyDay(todayKey), storageMode: storageMode(), todayKey },
        { headers: NO_STORE },
      );
    }

    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    const next: DayView = { ...previous };
    let changed = false;

    if (body.status !== undefined) {
      const status = requestedStatus(body);
      if (!status) {
        return NextResponse.json(
          { error: "상태 값이 올바르지 않아요. (waiting / arrived / sold_out)" },
          { status: 400, headers: NO_STORE },
        );
      }
      if (status !== previous.status) {
        next.status = status;
        next.arrived = status === "arrived";
        changed = true;
      }
    } else if (typeof body.arrived === "boolean" && body.arrived !== previous.arrived) {
      // status 를 보내지 않는 예전 클라이언트
      const status = requestedStatus(body);
      if (status) {
        next.status = status;
        next.arrived = status === "arrived";
        changed = true;
      }
    }

    if (typeof body.label === "string") {
      const label = body.label.trim().slice(0, MAX_LABEL_LENGTH);
      if (label !== previous.label) {
        next.label = label;
        changed = true;
      }
    }

    if (typeof body.memo === "string") {
      const memo = body.memo.trim().slice(0, MAX_MEMO_LENGTH);
      if (memo !== previous.memo) {
        next.memo = memo;
        changed = true;
      }
    }

    if (!changed) {
      // 같은 내용이면 저장도 알림도 하지 않습니다.
      return NextResponse.json(
        { today: previous, storageMode: storageMode(), todayKey },
        { headers: NO_STORE },
      );
    }

    const now = new Date().toISOString();
    next.updatedAt = now;
    next.revision = previous.revision + 1;

    // "도착했어요" 로 바뀐 순간에만 Teams 로 알립니다. (선택)
    const announceArrival = next.status === "arrived" && previous.status !== "arrived";

    // "도착했어요 → 다 떨어졌어요" 로 바뀐 순간, 하루 한 번만 품절 알림을 보냅니다.
    // 이미 보낸 날(soldOutNotifiedAt)에는 다시 보내지 않습니다.
    const announceSoldOut =
      next.status === "sold_out" && previous.status === "arrived" && !previous.soldOutNotifiedAt;
    if (announceSoldOut) next.soldOutNotifiedAt = now;

    await writeDay(next);

    // request 를 넘겨 배포된 사이트 주소(x-forwarded-host 등)를 카드 버튼·미리보기에 씁니다.
    if (announceArrival) {
      // 팀 알림(Teams)과 휴대폰 알림(Web Push)을 함께 보냅니다.
      // 어느 한쪽이 실패해도 상태 저장은 그대로 성공으로 돌려줍니다.
      const deliveries = await Promise.allSettled([
        notifyTeams(next, request, "arrived"),
        sendArrivalPush(next),
      ]);
      const push = deliveries[1];
      if (push?.status === "fulfilled") {
        const { subscribers, sent, failed, removed } = push.value;
        if (subscribers > 0) {
          console.log(`[api/status] 푸시 알림 ${sent}건 발송 · 실패 ${failed}건 · 만료 정리 ${removed}건`);
        }
      } else if (push) {
        console.error("[api/status] 푸시 알림 발송 실패", push.reason);
      }
    } else if (announceSoldOut) {
      await notifyTeams(next, request, "sold_out");
    }

    return NextResponse.json(
      { today: next, storageMode: storageMode(), todayKey },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/status] write failed", error);
    return NextResponse.json(
      { error: "저장하지 못했어요. 잠시 후 자동으로 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
