import { NextResponse } from "next/server";

import { kstDateKey } from "@/lib/kst";
import { readDay, storageMode, writeDay } from "@/lib/store";
import {
  emptyDay,
  isReactionKey,
  REACTIONS,
  type DayView,
  type ReactionKey,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * 오늘 간식에 반응을 하나 더합니다.
 * body: { type: "tasty" | "best" | "fire" }  (😋 맛있어요 / 👍 최고 / 🔥 순삭)
 *
 * 같은 사람이 여러 번 눌러도 그대로 쌓이는 단순 카운터입니다.
 * 기록 시각(updatedAt)은 건드리지 않아서 "마지막 기록" 표시가 흔들리지 않습니다.
 */
export async function POST(request: Request) {
  let body: { type?: unknown };
  try {
    body = (await request.json()) as { type?: unknown };
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const type: ReactionKey | null = isReactionKey(body.type) ? body.type : null;
  if (!type) {
    return NextResponse.json(
      {
        error: `반응 종류가 올바르지 않아요. (${REACTIONS.map((reaction) => `${reaction.emoji} ${reaction.key}`).join(" / ")})`,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const todayKey = kstDateKey();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    const next: DayView = {
      ...previous,
      reactions: {
        ...previous.reactions,
        [type]: (previous.reactions[type] ?? 0) + 1,
      },
      revision: previous.revision + 1,
    };
    await writeDay(next);

    return NextResponse.json(
      { today: next, storageMode: storageMode(), todayKey },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/reaction] write failed", error);
    return NextResponse.json(
      { error: "반응을 저장하지 못했어요. 잠시 후 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
