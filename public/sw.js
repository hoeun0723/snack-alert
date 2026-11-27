/* 오늘 간식 왔나요? 🍪 — 서비스 워커
 *
 * 하는 일:
 * 1) 안드로이드 크롬이 "앱 설치"를 제안할 수 있는 최소 조건을 채우기
 * 2) 화면을 열어 둘 때 띄우는 알림(notificationclick)을 처리하기
 * 3) 앱이 꺼져 있어도 오는 휴대폰 알림(push)을 띄우기
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

self.addEventListener("push", (event) => {
  // 서버(lib/push.ts)가 보낸 { title, body, url, tag, icon } 을 그대로 띄웁니다.
  // 휴대폰이 알림을 조용히 버리지 않도록, push 이벤트 안에서 showNotification 을 꼭 호출합니다.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: typeof event.data?.text === "function" ? event.data.text() : "" };
  }

  const title = (payload && payload.title) || "🍪 간식이 도착했어요!";
  const body = (payload && payload.body) || "지금 탕비실로 가보세요!";
  const url = (payload && payload.url) || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: (payload && payload.tag) || "snack-arrival",
      renotify: true,
      lang: "ko",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // 알림에 담긴 주소로 이동합니다. (없으면 사이트 첫 화면)
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if (targetUrl && "navigate" in client && client.url !== new URL(targetUrl, self.location.origin).href) {
            // 이미 사이트가 열려 있으면 탭을 하나 더 만들지 않고 그 탭을 씁니다.
            try {
              await client.navigate(targetUrl);
            } catch {
              // 이동에 실패해도 focus 만으로 충분합니다.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
