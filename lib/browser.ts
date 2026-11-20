/**
 * 브라우저에서만 쓰는 도우미들: 이미지 압축, 알림, 서비스 워커
 */

const MAX_SIDE = 800;
const TARGET_BYTES = 260_000;

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
 * 사진을 긴 변 800px 이하 JPEG 로 줄여 data URL 로 돌려줍니다.
 * (서버에 파일 저장소 없이 Redis 문자열로 보관하기 위함)
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const source = await loadSource(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
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

  let quality = 0.78;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (dataUrl.length > TARGET_BYTES && quality > 0.4) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
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

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
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
