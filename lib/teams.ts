import { kstDateLabel, kstTimeLabel } from "@/lib/kst";
import { photoPreviewUrl, resolveSiteUrl } from "@/lib/site";
import type { DayView } from "@/lib/types";

/** Teams 로 보내는 알림 종류 */
export type TeamsNoticeKind = "arrived" | "sold_out";

interface NoticeText {
  /** 카드 제목 */
  title: string;
  /** 알림 목록에 보이는 한 줄 요약 */
  summary: string;
  /** 카드 아래 버튼 이름 */
  button: string;
}

const NOTICES: Record<TeamsNoticeKind, NoticeText> = {
  arrived: {
    title: "🍪 오늘 간식 도착했어요!",
    summary: "간식 도착 알림 🍪",
    button: "간식 보드 열기 🍪",
  },
  sold_out: {
    title: "💨 오늘 간식이 다 떨어졌어요!",
    summary: "간식 품절 알림 💨",
    button: "간식 보드 열기 🍪",
  },
};

/** Adaptive Card 요소 (필요한 만큼만 정의) */
type CardElement = Record<string, unknown>;

function buildCardBody(day: DayView, siteUrl: string, notice: NoticeText): CardElement[] {
  const body: CardElement[] = [
    { type: "TextBlock", text: notice.title, weight: "Bolder", size: "Medium", wrap: true },
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
function buildFallbackText(day: DayView, siteUrl: string, notice: NoticeText): string {
  const lines = [notice.title];
  if (day.label) lines.push(`간식: ${day.label}`);
  if (day.memo) lines.push(`메모: ${day.memo}`);
  if (day.updatedAt) lines.push(`기록: ${kstTimeLabel(day.updatedAt)}`);
  lines.push(`👉 ${siteUrl}`);
  return lines.join("\n");
}

/** 알림을 보낼 Teams 웹훅 한 곳 */
interface WebhookTarget {
  url: string;
  /** 로그에 남길 구분 이름 (channel / chat) */
  tag: string;
}

/**
 * 알림을 보낼 Teams 웹훅 주소를 환경변수에서 모읍니다.
 *
 * - TEAMS_WEBHOOK_URL      : 채널(팀) 웹훅 주소 → tag "channel"
 * - TEAMS_WEBHOOK_CHAT_URL : 채팅(개인·그룹 채팅) 웹훅 주소 → tag "chat"
 *
 * 두 변수를 모두 읽고, 비어 있지 않은 주소만 남깁니다.
 * 한 변수에 콤마(,)로 여러 개를 넣어도 되고, 같은 주소가 겹치면 한 번만 보냅니다.
 */
function teamsWebhookTargets(): WebhookTarget[] {
  const sources: [value: string | undefined, tag: string][] = [
    [process.env.TEAMS_WEBHOOK_URL, "channel"],
    [process.env.TEAMS_WEBHOOK_CHAT_URL, "chat"],
  ];

  const targets: WebhookTarget[] = [];
  const seen = new Set<string>();

  for (const [value, tag] of sources) {
    if (!value) continue;
    for (const part of value.split(",")) {
      // 끝에 붙은 "/" 는 같은 주소로 보고 떼어 비교합니다.
      const url = part.trim().replace(/\/+$/, "");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      targets.push({ url, tag });
    }
  }

  return targets;
}

/** 웹훅 한 곳으로 알림을 보냅니다. 실패해도 예외를 던지지 않습니다. */
async function postToWebhook(target: WebhookTarget, payload: unknown, kind: TeamsNoticeKind): Promise<void> {
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) {
      console.error(
        `[teams] ${target.tag} webhook responded`,
        kind,
        response.status,
        (await response.text()).slice(0, 200),
      );
    }
  } catch (error) {
    // Teams 장애가 간식 알림 자체를 막지 않도록 조용히 로그만 남깁니다.
    console.error(
      `[teams] ${target.tag} webhook failed`,
      kind,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * 선택적 Microsoft Teams 알림.
 * Vercel 환경변수 TEAMS_WEBHOOK_URL(채널) · TEAMS_WEBHOOK_CHAT_URL(채팅) 중
 * 하나라도 있을 때 동작하고, 둘 다 없으면 조용히 넘어갑니다.
 * 두 곳에 모두 설정했다면 같은 알림을 동시에 보냅니다. (한쪽 실패가 다른 쪽을 막지 않음)
 *
 * - arrived  : "🍪 오늘 간식 도착했어요!"  ("아직 안 왔어요 → 도착했어요" 순간)
 * - sold_out : "💨 오늘 간식이 다 떨어졌어요!" ("도착했어요 → 다 떨어졌어요" 순간, 하루 1회)
 *
 * - Power Automate "워크플로우" 웹훅: adaptive card attachments 로 전달
 *   (제목 · 간식 종류 · 메모 · 시각 · 사진 미리보기 · "간식 보드 열기" 버튼)
 * - 예전 Office 365 커넥터(Incoming Webhook): 본문의 text 필드를 사용
 * 둘 다 한 번에 보내도록 두 형태를 함께 담습니다.
 *
 * 사이트 주소는 호출한 요청(request)의 헤더나 Vercel 환경변수에서 계산합니다.
 * 팀즈 채널을 새로 파서 웹훅을 다시 만들면 TEAMS_WEBHOOK_URL 만 교체하면 됩니다.
 * 채팅으로도 보내려면 TEAMS_WEBHOOK_CHAT_URL 에 채팅 웹훅 주소를 넣으면 됩니다.
 */
export async function notifyTeams(
  day: DayView,
  request?: Request,
  kind: TeamsNoticeKind = "arrived",
): Promise<void> {
  const targets = teamsWebhookTargets();
  if (targets.length === 0) return;

  const notice = NOTICES[kind];
  const siteUrl = resolveSiteUrl(request);
  const text = buildFallbackText(day, siteUrl, notice);

  const payload = {
    type: "message",
    text,
    summary: notice.summary,
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
          body: buildCardBody(day, siteUrl, notice),
          actions: [{ type: "Action.OpenUrl", title: notice.button, url: siteUrl }],
        },
      },
    ],
  };

  // 채널·채팅 등 여러 웹훅으로 동시에 보냅니다.
  // allSettled 라서 한쪽이 실패해도 나머지 전송은 그대로 진행됩니다.
  await Promise.allSettled(targets.map((target) => postToWebhook(target, payload, kind)));
}
