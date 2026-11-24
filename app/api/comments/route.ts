import { NextResponse } from "next/server";

import { kstDateKey } from "@/lib/kst";
import { readDay, storageMode, writeDay } from "@/lib/store";
import {
  emptyDay,
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS_PER_DAY,
  type DayComment,
  type DayView,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * 그날그날 익명 한 줄 댓글.
 *
 * ⚠️ 이 파일은 lib/teams 를 절대 부르지 않습니다.
 *    Teams 알림은 기존처럼 "간식 도착 / 품절" 상태가 바뀔 때만 나가야 하고,
 *    댓글 작성·삭제는 조용히 저장만 합니다.
 *
 * 댓글은 그날(KST) 기록에 함께 담겨서 자정이 지나면 새 날짜는 빈 목록으로 시작합니다.
 */

function newCommentId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random.replace(/-/g, "").slice(0, 12);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function response(day: DayView, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      today: day,
      comments: day.comments,
      storageMode: storageMode(),
      todayKey: day.date,
      ...extra,
    },
    { headers: NO_STORE },
  );
}

/** 오늘 남긴 댓글 목록 */
export async function GET() {
  const todayKey = kstDateKey();
  try {
    const day = (await readDay(todayKey)) ?? emptyDay(todayKey);
    return response(day);
  } catch (error) {
    console.error("[api/comments] read failed", error);
    return NextResponse.json(
      { error: "댓글을 불러오지 못했어요. 잠시 후 자동으로 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/** 댓글 남기기. body: { text: "한 줄" } */
export async function POST(request: Request) {
  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "빈 댓글은 남길 수 없어요. 한 줄 적어 주세요." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `댓글은 ${MAX_COMMENT_LENGTH}자까지 남길 수 있어요.` },
      { status: 400, headers: NO_STORE },
    );
  }

  const todayKey = kstDateKey();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    if (previous.comments.length >= MAX_COMMENTS_PER_DAY) {
      return NextResponse.json(
        { error: `오늘 댓글이 ${MAX_COMMENTS_PER_DAY}개로 가득 찼어요. 내일 다시 남겨 주세요.` },
        { status: 409, headers: NO_STORE },
      );
    }

    const comment: DayComment = {
      id: newCommentId(),
      text,
      createdAt: new Date().toISOString(),
    };

    // 댓글은 "마지막 기록(updatedAt)"을 건드리지 않습니다. (반응 카운터와 같은 결)
    const next: DayView = {
      ...previous,
      comments: [...previous.comments, comment],
      revision: previous.revision + 1,
    };
    await writeDay(next);

    return response(next, { comment });
  } catch (error) {
    console.error("[api/comments] write failed", error);
    return NextResponse.json(
      { error: "댓글을 저장하지 못했어요. 잠시 후 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/** 댓글 지우기. body: { id } 또는 ?id= */
export async function DELETE(request: Request) {
  let id = new URL(request.url).searchParams.get("id") ?? "";

  if (!id) {
    try {
      const body = (await request.json()) as { id?: unknown };
      if (typeof body.id === "string") id = body.id;
    } catch {
      // 본문이 없으면 아래에서 400 으로 처리합니다.
    }
  }

  if (!id) {
    return NextResponse.json(
      { error: "지울 댓글을 찾지 못했어요." },
      { status: 400, headers: NO_STORE },
    );
  }

  const todayKey = kstDateKey();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    const comments = previous.comments.filter((comment) => comment.id !== id);

    if (comments.length === previous.comments.length) {
      // 이미 지워졌거나 없는 댓글 — 지금 상태를 그대로 돌려줍니다.
      return response(previous);
    }

    const next: DayView = {
      ...previous,
      comments,
      revision: previous.revision + 1,
    };
    await writeDay(next);

    return response(next);
  } catch (error) {
    console.error("[api/comments] delete failed", error);
    return NextResponse.json(
      { error: "댓글을 지우지 못했어요. 잠시 후 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
