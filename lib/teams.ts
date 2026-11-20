import { kstDateLabel, kstTimeLabel } from "@/lib/kst";
import { photoPreviewUrl, resolveSiteUrl } from "@/lib/site";
import type { DayView } from "@/lib/types";

const CARD_TITLE = "🍪 오늘 간식 도착했어요!";
const BUTTON_TITLE = "간식 보드 열기 🍪";
const SUMMARY = "간식 도착 알림 🍪";

/** Adaptive Card 요소 (필요한 만큼만 정의) */
type CardElement = Record<string, unknown>;

function buildCardBody(day: DayView, siteUrl: string): CardElement[] {
  const body: CardElement[] = [
    { type: "TextBlock", text: CARD_TITLE, weight: "Bolder", size: "Medium", wrap: true },
  ];

  if (day.hasPhoto) {
    // 사진을 등록한 날에만 미리보기 이미지를 넣습니다.
    body.push({
      type: "Image",
      url: photoPreviewUrl(siteUrl, day.photoVersion),
      altText: day.label ? `오늘의 간식 사진 (${day.label})` : "오늘의 간식 사진",
      size: "Stretch",
      spacing: "Medium",
    });
  }

  if (day.label) {
    body.push({ type: "TextBlock", text: day.label, weight: "Bolder", size: "Large", wrap: true, spacing: "Medium" });
  }

  if (day.memo) {
    body.push({ type: "TextBlock", text: day.memo, wrap: true, isSubtle: true, spacing: "Small" });
  }

  const timeLabel = day.updatedAt ? kstTimeLabel(day.updatedAt) : "";
  const stamp = [kstDateLabel(day.date), timeLabel ? `기록 ${timeLabel}` : ""].filter(Boolean).join(" · ");
  if (stamp) {
    body.push({ type: "TextBlock", text: stamp, wrap: true, isSubtle: true, spacing: "Small" });
  }

  return body;
}

/** 링크를 붙여넣은 것처럼 보이도록 주소를 그대로 넣습니다. (Teams·카톡이 자동으로 링크 처리) */
function buildFallbackText(day: DayView, siteUrl: string): string {
  const lines = [CARD_TITLE];
  if (day.label) lines.push(`간식: ${day.label}`);
  if (day.memo) lines.push(`메모: ${day.memo}`);
  if (day.updatedAt) lines.push(`기록: ${kstTimeLabel(day.updatedAt)}`);
  lines.push(`👉 ${siteUrl}`);
  return lines.join("\n");
}

/**
 * 선택적 Microsoft Teams 알림.
 * Vercel 환경변수 TEAMS_WEBHOOK_URL 이 있을 때만 동작하고, 없으면 조용히 넘어갑니다.
 *
 * - Power Automate "워크플로우" 웹훅: adaptive card attachments 로 전달
 *   (제목 · 간식 종류 · 메모 · 시각 · 사진 미리보기 · "간식 보드 열기" 버튼)
 * - 예전 Office 365 커넥터(Incoming Webhook): 본문의 text 필드를 사용
 * 둘 다 한 번에 보내도록 두 형태를 함께 담습니다.
 *
 * 사이트 주소는 호출한 요청(request)의 헤더나 Vercel 환경변수에서 계산합니다.
 * 팀즈 채널을 새로 파서 웹훅을 다시 만들면 TEAMS_WEBHOOK_URL 만 교체하면 됩니다.
 */
export async function notifyTeams(day: DayView, request?: Request): Promise<void> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const siteUrl = resolveSiteUrl(request);
  const text = buildFallbackText(day, siteUrl);

  const payload = {
    type: "message",
    text,
    summary: SUMMARY,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          // Teams 에서 카드를 채널 폭에 맞춰 보여줍니다. (다른 곳에서는 무시됨)
          msteams: { width: "Full" },
          body: buildCardBody(day, siteUrl),
          actions: [{ type: "Action.OpenUrl", title: BUTTON_TITLE, url: siteUrl }],
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
