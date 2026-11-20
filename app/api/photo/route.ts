import { NextResponse } from "next/server";

import { kstDateKey } from "@/lib/kst";
import { deletePhoto, readDay, readPhoto, storageMode, writeDay, writePhoto } from "@/lib/store";
import { emptyDay, MAX_PHOTO_DATA_URL_LENGTH, type DayView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/** 오늘 등록된 간식 사진을 그대로 돌려줍니다. */
export async function GET(request: Request) {
  const todayKey = kstDateKey();

  try {
    const photo = await readPhoto(todayKey);
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
        // ?v=버전이 붙은 요청만 오래 캐시합니다. (사진이 바뀌면 주소도 바뀜)
        "Cache-Control": hasVersion ? "public, max-age=31536000, immutable" : "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[api/photo] read failed", error);
    return NextResponse.json(
      { error: "사진을 불러오지 못했어요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/** 사진 등록. body: { dataUrl: "data:image/jpeg;base64,..." } */
export async function POST(request: Request) {
  let body: { dataUrl?: unknown };
  try {
    body = (await request.json()) as { dataUrl?: unknown };
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const match = DATA_URL_PATTERN.exec(dataUrl);
  const type = match?.[1];
  const data = match?.[2];

  if (!type || !data) {
    return NextResponse.json(
      { error: "이미지 형식이 올바르지 않아요. (JPEG/PNG/WEBP)" },
      { status: 400, headers: NO_STORE },
    );
  }

  if (data.length > MAX_PHOTO_DATA_URL_LENGTH) {
    return NextResponse.json(
      { error: "사진이 너무 커요. 조금 작은 사진으로 다시 올려주세요." },
      { status: 413, headers: NO_STORE },
    );
  }

  const todayKey = kstDateKey();
  const now = new Date().toISOString();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    await writePhoto(todayKey, { type, data, updatedAt: now });

    const next: DayView = {
      ...previous,
      hasPhoto: true,
      photoVersion: now,
      updatedAt: now,
      revision: previous.revision + 1,
    };
    await writeDay(next);

    return NextResponse.json(
      { today: next, storageMode: storageMode(), todayKey },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/photo] write failed", error);
    return NextResponse.json(
      { error: "사진을 저장하지 못했어요. 잠시 후 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/** 사진 삭제. */
export async function DELETE() {
  const todayKey = kstDateKey();
  const now = new Date().toISOString();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    await deletePhoto(todayKey);

    const next: DayView = {
      ...previous,
      hasPhoto: false,
      photoVersion: null,
      updatedAt: now,
      revision: previous.revision + 1,
    };
    await writeDay(next);

    return NextResponse.json(
      { today: next, storageMode: storageMode(), todayKey },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/photo] delete failed", error);
    return NextResponse.json(
      { error: "사진을 지우지 못했어요. 잠시 후 다시 시도할게요." },
      { status: 503, headers: NO_STORE },
    );
  }
}
