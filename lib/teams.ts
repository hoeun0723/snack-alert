import { kstTimeLabel } from "@/lib/kst";
import type { DayView } from "@/lib/types";

/**
 * 선택적 Microsoft Teams 알림.
 * Vercel 환경변수 TEAMS_WEBHOOK_URL 이 있을 때만 동작하고, 없으면 조용히 넘어갑니다.
 *
 * - Power Automate "워크플로" 웹훅: adaptive card attachments 로 전달
 * - 예전 Office 365 커넥터(Incoming Webhook): 본문의 text 필드를 사용
 * 둘 다 한 번에 보내도록 두 형태를 함께 담습니다.
 */
export async function notifyTeams(day: DayView): Promise<void> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const lines = ["🍪 오늘 간식 도착했어요!"];
  if (day.label) lines.push(`간식: ${day.label}`);
  if (day.memo) lines.push(`메모: ${day.memo}`);
  if (day.updatedAt) lines.push(`기록: ${kstTimeLabel(day.updatedAt)}`);

  const text = lines.join("\n");

  const payload = {
    type: "message",
    text,
    summary: "간식 도착 알림 🍪",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.2",
          body: [
            { type: "TextBlock", text: "🍪 오늘 간식 도착!", weight: "Bolder", size: "Medium", wrap: true },
            ...(day.label ? [{ type: "TextBlock", text: day.label, wrap: true }] : []),
            ...(day.memo ? [{ type: "TextBlock", text: day.memo, wrap: true, isSubtle: true }] : []),
            ...(day.updatedAt
              ? [{ type: "TextBlock", text: `기록 ${kstTimeLabel(day.updatedAt)}`, wrap: true, isSubtle: true }]
              : []),
          ],
        },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) {
      console.warn("[teams] webhook responded", response.status, (await response.text()).slice(0, 200));
    }
  } catch (error) {
    // Teams 장애가 간식 알림 자체를 막지 않도록 조용히 로그만 남깁니다.
    console.warn("[teams] webhook failed", error instanceof Error ? error.message : error);
  }
}
