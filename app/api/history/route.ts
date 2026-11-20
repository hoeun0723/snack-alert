import { NextResponse } from "next/server";

import { buildHistory } from "@/lib/history";
import { kstDateKey, shiftDateKey } from "@/lib/kst";
import { readDays, storageMode } from "@/lib/store";
import { HISTORY_DAYS, type HistoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * 최근 HISTORY_DAYS 일 중 기록이 있는 날을 최신순으로 돌려줍니다.
 * Redis 에서는 MGET 한 번으로 읽습니다.
 */
export async function GET() {
  const todayKey = kstDateKey();
  const dates = Array.from({ length: HISTORY_DAYS }, (_, index) => shiftDateKey(todayKey, -index));

  try {
    const days = await readDays(dates);
    const { history, popular } = buildHistory(days);

    const body: HistoryResponse = {
      history,
      popular,
      storageMode: storageMode(),
      todayKey,
    };

    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/history] read failed", error);
    return NextResponse.json(
      { error: "히스토리를 불러오지 못했어요. 잠시 후 자동으로 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
