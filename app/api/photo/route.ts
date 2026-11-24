import { NextResponse } from "next/server";

import { kstDateKey } from "@/lib/kst";
import {
  deleteAllPhotos,
  LEGACY_PHOTO_ID,
  readDay,
  readPhotoById,
  storageMode,
  writeDay,
  writePhotoById,
} from "@/lib/store";
import {
  emptyDay,
  MAX_PHOTO_BATCH_DATA_URL_LENGTH,
  MAX_PHOTO_DATA_URL_LENGTH,
  MAX_PHOTOS_PER_DAY,
  type DayPhotoMeta,
  type DayView,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

interface ParsedPhoto {
  type: string;
  data: string;
}

/** 사진 id — URL 에 넣기 좋은 짧은 임의 문자열 */
function newPhotoId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random.replace(/-/g, "").slice(0, 12);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** body 에서 올릴 사진 목록을 data URL 배열로 꺼냅니다. (예전 단일 dataUrl 도 받습니다) */
function readIncomingDataUrls(body: {
  dataUrl?: unknown;
  dataUrls?: unknown;
}): string[] {
  if (Array.isArray(body.dataUrls)) {
    return body.dataUrls.filter((item): item is string => typeof item === "string");
  }
  if (typeof body.dataUrl === "string") return [body.dataUrl];
  return [];
}

/** 오늘의 대표 사진(마지막에 올린 사진)을 그대로 돌려줍니다. (링크 미리보기·예전 화면 호환) */
export async function GET(request: Request) {
  const todayKey = kstDateKey();

  try {
    const day = await readDay(todayKey);
    const latest = day?.photos[day.photos.length - 1];

    // 사진 목록이 없는 예전 데이터는 단일 사진 키(legacy)에서 읽습니다.
    const photo = latest
      ? await readPhotoById(todayKey, latest.id)
      : await readPhotoById(todayKey, LEGACY_PHOTO_ID);

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

/**
 * 사진 등록. body: { dataUrls: ["data:image/jpeg;base64,...", ...] }
 * 예전 화면 호환: { dataUrl: "..." } 한 장짜리 요청도 받습니다.
 * 이미 있는 사진은 그대로 두고 뒤에 덧붙입니다. (최대 MAX_PHOTOS_PER_DAY 장)
 */
export async function POST(request: Request) {
  let body: { dataUrl?: unknown; dataUrls?: unknown };
  try {
    body = (await request.json()) as { dataUrl?: unknown; dataUrls?: unknown };
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400, headers: NO_STORE });
  }

  const dataUrls = readIncomingDataUrls(body);

  if (dataUrls.length === 0) {
    return NextResponse.json(
      { error: "이미지 형식이 올바르지 않아요. (JPEG/PNG/WEBP)" },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsedPhotos: ParsedPhoto[] = [];
  for (const dataUrl of dataUrls) {
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
        { error: "사진 한 장이 너무 커요. 조금 작은 사진으로 다시 올려주세요." },
        { status: 413, headers: NO_STORE },
      );
    }
    parsedPhotos.push({ type, data });
  }

  const totalLength = parsedPhotos.reduce((sum, photo) => sum + photo.data.length, 0);
  if (totalLength > MAX_PHOTO_BATCH_DATA_URL_LENGTH) {
    return NextResponse.json(
      { error: "한 번에 올리기엔 사진이 너무 많아요. 몇 장씩 나눠 올려주세요." },
      { status: 413, headers: NO_STORE },
    );
  }

  const todayKey = kstDateKey();
  const now = new Date().toISOString();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    const room = MAX_PHOTOS_PER_DAY - previous.photos.length;
    if (room <= 0) {
      return NextResponse.json(
        { error: `사진은 하루에 ${MAX_PHOTOS_PER_DAY}장까지 올릴 수 있어요. 하나를 지우고 다시 올려주세요.` },
        { status: 409, headers: NO_STORE },
      );
    }
    const accepted = parsedPhotos.slice(0, room);

    const added: DayPhotoMeta[] = [];
    for (const photo of accepted) {
      const id = newPhotoId();
      await writePhotoById(todayKey, id, { type: photo.type, data: photo.data, updatedAt: now });
      added.push({ id, updatedAt: now });
    }

    const photos = [...previous.photos, ...added];
    const next: DayView = {
      ...previous,
      photos,
      hasPhoto: photos.length > 0,
      photoVersion: photos[photos.length - 1]?.updatedAt ?? null,
      updatedAt: now,
      revision: previous.revision + 1,
    };
    await writeDay(next);

    const skipped = parsedPhotos.length - accepted.length;

    return NextResponse.json(
      {
        today: next,
        storageMode: storageMode(),
        todayKey,
        ...(skipped > 0
          ? { warning: `사진은 ${MAX_PHOTOS_PER_DAY}장까지라서 ${skipped}장은 올리지 못했어요.` }
          : {}),
      },
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

/** 오늘 사진을 모두 삭제. (예전 화면의 "지우기"와 같은 동작) */
export async function DELETE() {
  const todayKey = kstDateKey();
  const now = new Date().toISOString();

  try {
    const previous = (await readDay(todayKey)) ?? emptyDay(todayKey);
    await deleteAllPhotos(todayKey);

    const next: DayView = {
      ...previous,
      photos: [],
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
