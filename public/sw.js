/* 오늘 간식 왔나요? 🍪 — 서비스 워커
 *
 * 목적은 두 가지입니다.
 * 1) 안드로이드 크롬이 "앱 설치"를 제안할 수 있는 최소 조건을 채우기
 * 2) 화면이 열려 있을 때 띄우는 알림(notificationclick)을 처리하기
 *
 * 원칙: /api/* 는 절대 캐시하지 않고 항상 네트워크로 통과시킵니다.
 *       (간식 상태·사진·댓글이 실시간으로 맞아야 하기 때문)
 *       페이지 이동도 네트워크 우선이고, 오프라인일 때만 안내 페이지를 보여 줍니다.
 */

const CACHE = "snack-alert-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        // 오프라인 안내 페이지를 못 받아도 설치는 계속합니다.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 이 아니면 손대지 않습니다. (상태 변경·사진 업로드·댓글)
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 실시간 데이터: 캐시 금지, 항상 네트워크
  if (url.pathname.startsWith("/api/")) return;

  // 페이지 이동만 네트워크 우선 + 오프라인 안내
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(OFFLINE_URL);
          return (
            cached ??
            new Response("인터넷에 연결되어 있지 않아요.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // 그 밖의 정적 파일은 브라우저 기본 동작(HTTP 캐시)에 맡깁니다.
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow("/");
    })(),
  );
});
