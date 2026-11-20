import { NextResponse } from "next/server";

import { kstDateKey, shiftDateKey } from "@/lib/kst";
import { clearDay, readDay, storageMode, writeDay } from "@/lib/store";
import { notifyTeams } from "@/lib/teams";
import {
  emptyDay,
  MAX_LABEL_LENGTH,
  MAX_MEMO_LENGTH,
  type DayView,
  type StatusResponse,
  type StatusUpdateBody,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

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
 * body: { arrived?: boolean, label?: string, memo?: string, reset?: true }
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

    if (typeof body.arrived === "boolean" && body.arrived !== previous.arrived) {
      next.arrived = body.arrived;
      changed = true;
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

    next.updatedAt = new Date().toISOString();
    next.revision = previous.revision + 1;
    await writeDay(next);

    // "아직 안 왔어요" → "도착했어요" 로 바뀐 순간에만 Teams 로도 알립니다. (선택)
    // request 를 넘겨 배포된 사이트 주소(x-forwarded-host 등)를 카드 버튼·미리보기에 씁니다.
    if (!previous.arrived && next.arrived) {
      await notifyTeams(next, request);
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
