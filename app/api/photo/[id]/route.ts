import { NextResponse } from "next/server";

import { kstDateKey } from "@/lib/kst";
import { photoCacheHeaders, readDateParam } from "@/lib/photo-date";
import { deletePhotoById, readDay, readPhotoById, storageMode, writeDay } from "@/lib/store";
import { emptyDay, type DayView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 사진 한 장을 id 로 돌려줍니다. (/api/photo/{id}?v=등록시각)
 * 히스토리에서 과거 사진을 볼 때는 ?date=YYYY-MM-DD 로 그날 사진을 지정합니다.
 *  - date 가 없으면 오늘 사진 (예전 화면과 같은 동작)
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const target = readDateParam(request);

  if (target.invalid) {
    return NextResponse.json(
      { error: "날짜 형식이 올바르지 않아요. (YYYY-MM-DD)" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const photo = await readPhotoById(target.date, id);
    if (!photo) {
      return new NextResponse(null, { status: 404, headers: NO_STORE });
    }

    const bytes = Uint8Array.from(Buffer.from(photo.data, "base64"));
    const hasVersion = new URL(request.url).searchParams.has("v");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": photo.type,
        "Content-Length": String(bytes.byteLength),
        ...photoCacheHeaders(hasVersion),
      },
    });
  } catch (error) {
    console.error("[api/photo/:id] read failed", error);
    return NextResponse.json(
      { error: "사진을 불러오지 못했어요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/**
 * 사진 한 장을 지웁니다. 남은 사진 목록을 함께 돌려줍니다.
 * 지우기는 오늘 사진만 됩니다. (히스토리는 읽기 전용)
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const todayKey = kstDateKey();
  const now = new Date().toISOString();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    const photos = previous.photos.filter((photo) => photo.id !== id);

    if (photos.length === previous.photos.length) {
      // 이미 지워졌거나 없는 사진 — 지금 상태를 그대로 돌려줍니다.
      return NextResponse.json(
        { today: previous, storageMode: storageMode(), todayKey },
        { headers: NO_STORE },
      );
    }

    await deletePhotoById(todayKey, id);

    const next: DayView = {
      ...previous,
      photos,
      hasPhoto: photos.length > 0,
      photoVersion: photos[photos.length - 1]?.updatedAt ?? null,
      updatedAt: now,
      revision: previous.revision + 1,
    };
    await writeDay(next);

    return NextResponse.json(
      { today: next, storageMode: storageMode(), todayKey },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/photo/:id] delete failed", error);
    return NextResponse.json(
      { error: "사진을 지우지 못했어요. 잠시 후 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
