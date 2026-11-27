/**
 * 브라우저에서만 쓰는 도우미들: 이미지 압축, 알림, 서비스 워커
 */

const MAX_SIDE = 800;
const TARGET_BYTES = 260_000;
/** 사진 여러 장을 한 번에 올릴 때 — 조금 더 줄여서 다섯 장을 올려도 가볍게 (약 180KB × 5) */
const MULTI_MAX_SIDE = 900;
const MULTI_TARGET_BYTES = 180_000;

function loadWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했어요."));
    };
    image.src = url;
  });
}

async function loadSource(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      };
    } catch {
      // 사파리 구버전 등: <img> 로 대체
    }
  }

  const image = await loadWithImageElement(file);
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
  };
}

/**
 * 사진을 긴 변 maxSide 이하 JPEG 로 줄여 data URL 로 돌려줍니다.
 * (서버에 파일 저장소 없이 Redis 문자열로 보관하기 위함)
 *
 * options 를 주면 크기·용량 목표를 바꿀 수 있습니다. (여러 장 올릴 때 사용)
 */
export async function compressImageToDataUrl(
  file: File,
  options: { maxSide?: number; targetBytes?: number; quality?: number } = {},
): Promise<string> {
  const maxSide = options.maxSide ?? MAX_SIDE;
  const targetBytes = options.targetBytes ?? TARGET_BYTES;

  const source = await loadSource(file);
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("이 브라우저에서는 사진을 줄일 수 없어요.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  source.draw(context, width, height);

  let quality = options.quality ?? 0.78;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (dataUrl.length > targetBytes && quality > 0.4) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
}

/**
 * 사진 여러 장을 한 장씩 차례로 줄여 data URL 배열로 돌려줍니다.
 * (동시에 줄이면 모바일에서 메모리가 버티지 못해서 순서대로 처리합니다)
 */
export async function compressImagesToDataUrls(
  files: File[],
  options: { maxSide?: number; targetBytes?: number } = {},
): Promise<string[]> {
  const maxSide = options.maxSide ?? MULTI_MAX_SIDE;
  const targetBytes = options.targetBytes ?? MULTI_TARGET_BYTES;
  const results: string[] = [];
  for (const file of files) {
    results.push(await compressImageToDataUrl(file, { maxSide, targetBytes }));
  }
  return results;
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * 카카오톡·인스타그램 같은 앱 안 브라우저인지.
 * 앱 안에서는 홈 화면 추가가 안 되니 "먼저 Safari/크롬으로 열기"를 안내합니다.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|Twitter/i.test(ua);
}

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

/**
 * iOS 사파리인지 (아이폰·아이패드).
 * 아이폰의 크롬·파이어폭스 등은 "홈 화면에 추가"가 없어서 사파리만 안내합니다.
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const iOS = /iPad|iPhone|iPod/.test(ua) || iPadOS;
  const anotherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  return iOS && !anotherBrowser;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    // 파일이 갱신되면 브라우저가 알아서 새 워커로 교체합니다 (sw.js 는 항상 네트워크에서 확인).
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** 서비스 워커가 있으면 그쪽으로, 없으면 페이지 컨텍스트로 알림을 띄웁니다. */
export async function showSnackNotification(title: string, body: string): Promise<boolean> {
  if (!notificationsSupported()) return false;

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "snack-arrival",
    renotify: true,
    lang: "ko",
  };

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    // 아래 페이지 알림으로 재시도
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/* ── 휴대폰 푸시 알림 (Web Push) ─────────────────────────── */

/**
 * 이 브라우저가 백그라운드 푸시를 쓸 수 있는지.
 * (안드로이드 크롬·삼성인터넷, 데스크톱 크롬·엣지, iOS 16.4+ 홈 화면 앱)
 */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * 아이폰·아이패드에서 홈 화면에 추가하지 않은 상태인지.
 * iOS 는 16.4 부터 "홈 화면에 추가한 앱"에서만 푸시를 받을 수 있습니다.
 */
export function needsIOSInstallForPush(): boolean {
  return isIOSDevice() && !isStandaloneApp();
}

/** VAPID 공개 키(base64url)를 브라우저가 쓰는 Uint8Array 로 바꿉니다. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** 지금 이 기기에 저장된 푸시 구독 (없으면 null) */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    return (await registration.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** 서비스 워커를 준비하고, VAPID 공개 키로 이 기기를 구독합니다. */
export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
}

/** 이 기기의 구독을 해제하고, 해제한 endpoint 를 돌려줍니다. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentPushSubscription();
  if (!subscription) return null;

  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    // 브라우저가 이미 지운 구독이면 서버 기록만 정리하면 됩니다.
  }
  return endpoint;
}
