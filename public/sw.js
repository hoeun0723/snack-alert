/* 오늘 간식 왔나요? 🍪 - 알림용 서비스 워커
 *
 * 백그라운드 푸시 서버는 쓰지 않습니다. 화면이 열려 있을 때 페이지가 15초마다
 * 상태를 확인하고, 바뀐 순간 이 워커를 통해 데스크톱/모바일 알림을 띄웁니다.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
