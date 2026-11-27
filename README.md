# 🍪 오늘 간식 왔나요?

회사 탕비실 간식이 **도착했는지 아닌지**를 팀원 모두가 한 화면에서 보고, 도착하는 순간 **브라우저 알림**으로 알려주는 아주 작은 웹사이트입니다.

- 주소 하나만 팀 단톡방에 붙여넣으면 끝 (로그인·비밀번호 없음)
- 누구나 **⏳ 아직 안 왔어요 / 🍪 도착했어요 / 💨 다 떨어졌어요** 세 가지 상태를 바꿀 수 있어요
- 간식 종류·한 줄 메모·사진도 함께 남길 수 있어요 (**사진은 하루 5장까지**, 눌러서 크게 보고 좌우로 넘겨 볼 수 있어요)
- **💬 오늘의 한 줄** — 이름 없이 남기는 익명 댓글을 팀원끼리 주고받아요 (Teams 알림은 가지 않아요)
- **🔔 휴대폰 알림** — 한 번만 켜 두면 앱을 닫아도 간식이 도착하는 순간 휴대폰으로 알려드려요 (안드로이드·iOS 16.4+ 홈 화면 앱)
- **😋 맛있어요 / 👍 최고 / 🔥 순삭** 반응을 누구나 누를 수 있고, 최근 간식 히스토리와 **인기 간식(👑)** 이 쌓여요
- 팀 전체 알림(도착·품절)이 나가는 버튼은 **한 번 더 확인**한 뒤에 전송해요 (실수로 눌러도 팀원에게 알림이 가지 않아요)
- 매일 **KST 자정**에 새 날짜로 자동 전환되고, 지난 기록은 히스토리로 남습니다
- Vercel 무료 플랜 + Upstash Redis 무료 플랜으로 운영 비용 0원

---

## 1단계 · Vercel로 배포하기 (약 1분)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhoeun0723%2Fsnack-alert)

1. 위 버튼을 누르고 **Vercel에 GitHub 계정으로 로그인**합니다.
2. 저장소 이름을 확인하고 **Deploy**를 누릅니다. (설정은 아무것도 건드리지 않아도 됩니다)
3. 배포가 끝나면 `https://snack-alert-xxxx.vercel.app` 같은 주소가 나옵니다. 이 주소를 팀원에게 공유하세요.

> 대시보드에서 직접 하려면: <https://vercel.com/new> → **Import Git Repository** → `hoeun0723/snack-alert` → **Deploy**

---

## 2단계 · 팀원끼리 같은 상태 보기 (Upstash Redis 무료 연결, 약 1분)

연결하지 않아도 사이트는 열리지만, 그때는 **임시 저장 모드**라서 서버가 잠들면 기록이 사라지고 팀원끼리 같은 상태가 보이지 않을 수 있어요.
아래처럼 **Upstash Redis(무료)** 를 연결하면 모든 팀원이 같은 상태를 실시간으로 봅니다.

1. Vercel 프로젝트 → 상단 **Storage** 탭 → **Create Database** (또는 **Marketplace**) → **Upstash Redis** 선택
2. 리전은 가까운 곳(예: `Tokyo`)을 고르고 **Free** 플랜으로 **Create** → **Connect Project** 로 이 프로젝트와 연결
3. 자동으로 추가된 환경변수를 확인하고 **Redeploy**(Deployments → 최신 배포 → ⋯ → Redeploy) 한 번 눌러주세요

연결되면 다음 중 한 쌍이 프로젝트 환경변수에 들어갑니다. 이 프로젝트는 **둘 다 자동으로 인식**합니다.

| 방식 | 환경변수 이름 |
| --- | --- |
| Upstash 콘솔에서 직접 복사 | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Vercel 통합 마켓플레이스 | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |

화면 하단에 초록 점과 함께 **“팀 전체가 같은 상태를 보고 있어요”** 가 보이면 성공입니다.
(노란 점 + “임시 저장 모드”라면 2단계를 아직 못 한 상태예요.)

> 💡 이미 Upstash 계정이 있다면: <https://console.upstash.com> 에서 Redis 데이터베이스 생성 → **REST API** 탭의 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 값을 Vercel 프로젝트 **Settings → Environment Variables** 에 넣고 Redeploy 해도 됩니다.

---

## 3단계 · 휴대폰 알림 켜기 (앱을 닫아도 오는 알림)

사이트 오른쪽 위 **🔔 간식 알림 받기** 버튼을 한 번 누르면, 그 기기로는 **앱을 닫아도** 간식이 도착하는 순간 알림이 옵니다.
알림이 실제로 나가려면 배포한 프로젝트에 **VAPID 키** 두 개가 있어야 해요. (한 번만 넣으면 됩니다)

### (관리자) VAPID 키 넣기 — 약 1분

1. 키 만들기

   ```bash
   npx web-push generate-vapid-keys --json
   ```

2. Vercel 프로젝트 → **Settings → Environment Variables** 에 아래 값을 추가하고 **Redeploy**

   | 변수명 | 값 |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 생성된 `publicKey` |
   | `VAPID_PRIVATE_KEY` | 생성된 `privateKey` (**공개 금지**) |
   | `VAPID_SUBJECT` (선택) | `mailto:내메일@example.com` — 비우면 `mailto:snack-alert@example.com` |

3. 사이트를 새로고침하고 **🔔 간식 알림 받기** 를 누르면 끝!

> 키를 아직 넣지 않아도 사이트는 그대로 동작합니다. 버튼 아래에 “관리자 알림 키 설정 대기 중이에요” 라는 짧은 안내만 뜨고, 화면을 열어 둔 동안의 알림은 예전처럼 동작해요.

### 손님(팀원)이 알림 켜는 방법

| 기기 | 방법 |
| --- | --- |
| **안드로이드 크롬·삼성인터넷** | 사이트에서 **🔔 간식 알림 받기** → 알림 **허용** → 버튼이 **🔔 알림 켜짐** 으로 바뀝니다 |
| **아이폰(iOS 16.4+)** | 먼저 **공유 → 홈 화면에 추가** 후, 홈 화면 아이콘으로 열어 **🔔 간식 알림 받기** → **허용** |
| 데스크톱 크롬·엣지 | 같은 버튼을 누르면 브라우저 알림으로도 받습니다 |

- 알림이 뜨지 않으면: 기기 설정(또는 주소창 자물쇠) → 이 사이트의 **알림 → 허용**
- **아이폰 사파리 탭**이나 **카카오톡 같은 앱 안 브라우저**에서는 알림을 켤 수 없어요. 버튼 아래에 그 이유가 짧게 표시됩니다.
- 알림은 **“아직 안 왔어요 → 도착했어요”로 바뀌는 순간에 한 번** 나갑니다. 메모·사진·댓글만 고치면 가지 않아요.
- 버튼을 다시 누르면 알림을 끌 수 있습니다. (그 기기의 구독이 서버에서도 지워짐)
- 오래 쓰지 않는 기기는 만료된 구독이 자동으로 정리됩니다. (푸시 서비스가 404·410 을 주면 저장소에서 삭제)

### 화면을 열어 둔 동안의 알림 (예전 방식)

- 화면이 보일 때는 **15초마다** `/api/status` 를 확인해 알림을 띄웁니다. (백그라운드 탭은 60초)
- 휴대폰 알림을 켠 기기에서는 같은 알림이 두 번 뜨지 않도록 화면 알림을 잠시 쉽니다.

---

## 4단계 · 홈 화면에 추가 (앱처럼 쓰기)

사이트를 열면 위쪽에 작은 안내 배너가 떠요. 한 번만 설치하면 주소창 없이 앱처럼 열립니다. (닫으면 다시 조르지 않아요)

| 기기 | 방법 |
| --- | --- |
| **안드로이드 크롬** | 배너의 **설치** 버튼을 누르면 끝 (홈 화면에 아이콘이 생깁니다) |
| **아이폰 사파리** | 배너의 **방법 보기** → 사파리 아래 **공유(□↑)** → **홈 화면에 추가** → **추가** |
| 데스크톱 크롬·엣지 | 주소창 오른쪽 **설치** 아이콘 또는 배너의 **설치** 버튼 |

- 이미 홈 화면 아이콘으로 열었을 때는 배너가 나오지 않습니다.
- 오프라인일 때는 앱이 “지금은 연결이 끊겼어요” 안내 화면을 보여 줍니다.
- `/api/*` 응답은 서비스 워커가 **절대 캐시하지 않아서** 간식 상태·사진·댓글이 항상 최신으로 보입니다.

---

## (선택) Microsoft Teams 로도 알림 보내기

Vercel 프로젝트 **Settings → Environment Variables** 에 아래 값을 추가하고 Redeploy 하면,
“도착했어요”를 등록하거나 “도착했어요 → 다 떨어졌어요”로 바뀌는 순간 Teams 로도 메시지가 갑니다.

| 변수명 | 보내는 곳 |
| --- | --- |
| `TEAMS_WEBHOOK_URL` | Teams **채널**(팀) |
| `TEAMS_WEBHOOK_CHAT_URL` | Teams **채팅**(개인·그룹 채팅) |

- **둘 다 넣으면 채널과 채팅에 동시에** 같은 알림이 갑니다. (한쪽이 실패해도 다른 쪽은 그대로 전송)
- 한 변수에 콤마(`,`)로 여러 주소를 넣어도 되고, 같은 주소가 겹치면 한 번만 보냅니다.
- Teams 채널(또는 채팅) → **⋯ → Workflows(워크플로)** → “웹훅 요청이 수신되면 채널에 게시” 템플릿으로 만든 URL을 넣으면 됩니다.
- 예전 **Incoming Webhook**(Office 365 커넥터) URL도 함께 지원합니다.
- 두 변수를 모두 비워두면 아무 동작도 하지 않아요.

| 순간 | 알림 |
| --- | --- |
| 아직 안 왔어요 → **도착했어요** | `🍪 오늘 간식 도착했어요!` |
| 도착했어요 → **다 떨어졌어요** | `💨 오늘 간식이 다 떨어졌어요!` — **하루 한 번만** (같은 날 다시 품절로 바꿔도 반복 전송 없음) |

알림 카드에는 제목, 간식 종류·메모·기록 시각, 그리고 **사진을 올린 날에는 간식 사진 미리보기**가 함께 들어갑니다.
카드 아래 **“간식 보드 열기 🍪”** 버튼을 누르면 바로 사이트로 이동합니다. (버튼 주소는 배포된 사이트 주소로 자동 계산)

> 사진은 알림이 나가는 순간(= “도착했어요”를 처음 누르는 순간) 이미 등록돼 있어야 카드에 실립니다.
> 사진까지 함께 알림을 받고 싶다면 **사진을 먼저 올리고 “도착했어요”를 누르면** 돼요.
> (같은 날 메모만 고치거나 사진만 바꿔도 알림이 또 가지 않습니다 — 도배 방지)

### 알림이 나가기 전 한 번 더 확인해요

팀 전체에 알림이 실제로 나가는 버튼만 확인 팝업이 뜹니다. (실수로 눌러 팀원 모두에게 알림이 가는 일을 막는 장치)

| 누르는 버튼 | 팝업 문구 | 확인 버튼 |
| --- | --- | --- |
| 아직 안 왔어요 → **🍪 도착했어요** | “팀 전체에 간식 도착 알림이 전송됩니다. 정말 등록할까요?” | **알림 보내기** |
| 도착했어요 → **💨 다 떨어졌어요** | “팀 전체에 품절 알림이 전송됩니다. 정말 변경할까요?” | **변경하기** |

- **취소**, **ESC 키**, 팝업 바깥 배경을 누르면 아무것도 바뀌지 않고 그냥 닫힙니다.
- 간식 이름을 입력해 뒀다면 팝업에 “오늘 간식: 마들렌 · 3층 탕비실”처럼 함께 보여 줍니다.
- 알림이 나가지 않는 동작에는 팝업이 뜨지 않아요 — 메모·사진 저장, 반응, 도착 전에 품절로 바꾸는 경우, 이미 오늘 품절 알림을 보낸 뒤의 품절 전환.
- 휴대폰에서는 화면 아래에서 올라오는 시트로 보이고, 키보드로는 Tab 이 팝업 안에서만 돌아요.

### 새 간식 알림 방(채널·채팅)으로 옮기기

채널(또는 채팅)을 새로 파고 그곳에서 웹훅을 다시 만들었다면 **코드는 그대로 두고 환경변수만 바꾸면 됩니다.**

1. 새 채널(또는 채팅) → **⋯ → Workflows** → “웹훅 요청이 수신되면 채널에 게시” 로 새 웹훅 URL을 만듭니다.
2. Vercel 프로젝트 → **Settings → Environment Variables** → `TEAMS_WEBHOOK_URL`(채널) 또는 `TEAMS_WEBHOOK_CHAT_URL`(채팅) 값에 새 URL을 붙여넣고 **Save**.
3. **Deployments** → 최신 배포 → **⋯ → Redeploy** (환경변수는 재배포해야 반영됩니다).

> 사이트 주소는 `NEXT_PUBLIC_SITE_URL` → Vercel 의 `VERCEL_PROJECT_PRODUCTION_URL` → 요청 헤더 순으로 자동 계산되므로, 보통은 따로 넣지 않아도 됩니다.
> 팀즈·카톡에 링크만 붙여넣어도 제목·설명·미리보기 이미지(`/og-image.png`)가 뜹니다.

---

## 로컬에서 실행하기

```bash
npm install
npm run dev      # http://localhost:3000
# 또는
npm run build && npm start
```

- Redis 환경변수가 없으면 **인메모리 저장 모드**로 동작합니다. (로컬 테스트용)
- `.env.local` 에 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 을 넣으면 실제 Redis로 붙습니다. (예시: `.env.example`)
- 휴대폰 알림도 로컬에서 확인하려면 `.env.local` 에 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 를 넣으세요. (`npx web-push generate-vapid-keys --json`)
- 타입 검사만: `npm run typecheck`

---

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/status` | 오늘 상태(+ 반응 카운터) + 어제 기록 + 저장소 모드 |
| `POST` | `/api/status` | `{ status?: "waiting" \| "arrived" \| "sold_out", arrived?: boolean, label?: string, memo?: string, reset?: true }` |
| `GET` | `/api/history` | 최근 30일 중 기록이 있는 날(최신순) + 인기 간식 |
| `POST` | `/api/reaction` | `{ type: "tasty" \| "best" \| "fire" }` — 오늘 간식에 반응 하나 추가 |
| `GET` | `/api/photo` | 오늘의 대표 사진(마지막에 올린 사진) 본문 (없으면 404) |
| `POST` | `/api/photo` | `{ dataUrls: ["data:image/jpeg;base64,...", ...] }` 또는 예전 그대로 `{ dataUrl }` — 최대 5장까지 **덧붙임** |
| `DELETE` | `/api/photo` | 오늘 사진 **모두** 삭제 |
| `GET` | `/api/photo/{id}` | 오늘 올린 사진 한 장 (`?v=등록시각` 으로 캐시 무효화) |
| `DELETE` | `/api/photo/{id}` | 사진 한 장만 삭제 |
| `GET` | `/api/comments` | 오늘의 익명 한 줄 댓글 목록 |
| `POST` | `/api/comments` | `{ text }` — 한 줄 댓글 남기기 (최대 200자, 하루 50개) |
| `DELETE` | `/api/comments` | `{ id }` 또는 `?id=` — 댓글 하나 지우기 |
| `GET` | `/api/push/subscribe` | `{ configured, publicKey, subscriberCount }` — 알림 키 설정 여부·공개 키 (키가 없어도 200) |
| `POST` | `/api/push/subscribe` | `{ endpoint, keys: { p256dh, auth } }` — 이 기기 푸시 구독 저장 (같은 endpoint 는 중복 저장 안 됨) |
| `DELETE` | `/api/push/subscribe` | `{ endpoint }` — 구독 해제 |

> 댓글을 남기거나 지워도 **Teams 웹훅은 절대 나가지 않습니다.** (도착·품절 상태 변경 때만 전송)

`arrived` boolean 은 예전 클라이언트 호환용입니다. (`true` = `arrived`, `false` = `waiting`)
새 코드는 `status` 를 쓰면 되고, 응답에는 항상 `status` 와 `arrived` 가 함께 들어갑니다.

상태 응답 예시:

```json
{
  "today": {
    "date": "2026-11-20",
    "status": "sold_out",
    "arrived": false,
    "label": "마들렌 · 3층 탕비실",
    "memo": "커피랑 같이 드세요",
    "updatedAt": "2026-11-20T06:24:11.000Z",
    "hasPhoto": true,
    "photoVersion": "2026-11-20T06:25:02.000Z",
    "photos": [
      { "id": "a1b2c3d4e5f6", "updatedAt": "2026-11-20T06:25:02.000Z" },
      { "id": "f6e5d4c3b2a1", "updatedAt": "2026-11-20T06:31:40.000Z" }
    ],
    "comments": [
      { "id": "9f8e7d6c5b4a", "text": "마들렌 진짜 맛있어요 🍪", "createdAt": "2026-11-20T06:33:10.000Z" }
    ],
    "revision": 4,
    "reactions": { "tasty": 3, "best": 1, "fire": 0 },
    "soldOutNotifiedAt": "2026-11-20T07:02:33.000Z"
  },
  "yesterday": null,
  "storageMode": "redis",
  "todayKey": "2026-11-20"
}
```

히스토리 응답 예시:

```json
{
  "history": [ { "date": "2026-11-20", "status": "sold_out", "reactions": { "tasty": 3, "best": 1, "fire": 0 }, "...": "..." } ],
  "popular": { "label": "마들렌 · 3층 탕비실", "total": 17, "date": "2026-11-20" },
  "storageMode": "redis",
  "todayKey": "2026-11-20"
}
```

---

## 이렇게 동작해요

- **날짜**: 모든 날짜 계산은 `Asia/Seoul` 기준입니다. 저장 키가 `snack:status:2026-11-20` 형태라서 **자정이 지나면 자동으로 새 날짜**로 시작하고, 이전 날짜는 **최근 간식 히스토리**에 남습니다. (보관 30일)
- **사진**: 고른 사진을 브라우저에서 **긴 변 900px 이하 JPEG(≈130KB)** 로 줄여서 저장합니다. 여러 장을 올려도 요청·저장 용량이 가볍게 유지돼요. 파일 서버 없이 Redis 문자열로 보관하고, 사진 한 장은 `/api/photo/{id}` 로 따로 받아옵니다. (하루 5장)
- **한 줄 댓글**: 그날 기록(`snack:status:{날짜}`)의 `comments` 에 함께 쌓입니다. 그래서 **자정이 지나면 새 날은 빈 목록**으로 시작하고, 예전 날짜 기록처럼 `comments` 가 없는 데이터는 빈 목록(`comments ?? []`)으로 읽습니다. 작성 시각은 KST `오후 3:24` 형태로 보여 줘요. (최대 200자 · 하루 50개)
- **리액션**: 😋/👍/🔥 를 누를 때마다 오늘 기록의 `reactions` 카운터가 하나씩 올라갑니다. 같은 사람이 여러 번 눌러도 그대로 쌓이고, 기록 시각(마지막 기록)은 바뀌지 않아요.
- **히스토리**: 최근 30일 중 기록이 있는 날만 최신순으로 보여줍니다. 같은 간식 이름끼리 반응을 모아 1위를 **👑 인기 간식**으로 표시해요. (Redis 에서는 `MGET` 한 번으로 읽습니다)
- **동시 수정**: 마지막에 저장한 사람의 값이 남는 방식(라스트 라이트 윈)입니다. 팀 규모의 간식 알림에는 충분해요.
- **휴대폰 알림(Web Push)**: “도착했어요”로 바뀌는 순간 저장된 구독(기기)에 `web-push` 로 알림을 보내고(`Promise.allSettled`), 푸시 서비스가 **404·410** 을 주면 그 구독을 저장소에서 지웁니다. VAPID 키가 없으면 조용히 건너뜁니다(홈 화면·Teams 알림은 그대로).
- **알림 전 확인**: Teams 알림이 나가는 두 버튼은 팝업에서 한 번 더 확인해야 실제로 전송됩니다. (취소·ESC·배경 클릭으로 닫으면 상태도 그대로)
- **저장 실패 시**: 상단에 빨간 안내가 뜨고, 다음 폴링에서 자동으로 다시 시도합니다.

## 폴더 구조

```
app/
  api/status/route.ts   # 오늘/어제 상태 조회·수정 (3가지 상태)
  api/history/route.ts  # 최근 30일 히스토리 + 인기 간식
  api/reaction/route.ts # 😋 👍 🔥 반응 카운터
  api/photo/route.ts    # 사진 등록(최대 5장)·대표 사진 조회·전체 삭제
  api/photo/[id]/route.ts # 사진 한 장 조회·삭제
  api/comments/route.ts # 익명 한 줄 댓글 (Teams 알림 없음)
  api/push/subscribe/route.ts # 휴대폰 푸시 구독 조회·저장·해제
  page.tsx, layout.tsx, globals.css, icon.svg
components/
  SnackBoard.tsx        # 화면 전체 (3단 상태 버튼·리액션·폼·사진·댓글·히스토리·알림·폴링)
  CommentBoard.tsx      # 오늘의 한 줄 (익명 댓글 입력·목록)
  PhotoLightbox.tsx     # 사진 크게 보기 (여러 장 좌우 넘기기·스와이프)
  ConfirmDialog.tsx     # Teams 알림 전 확인 팝업 (취소·ESC·배경 클릭으로 닫힘)
  SnackBuddy.tsx        # 간식 요정 캐릭터 (⏳ 대기 / 🍪 도착 / 💨 품절)
  InstallPrompt.tsx     # 홈 화면에 추가 안내 (안드로이드 원클릭 · 아이폰 단계 안내)
lib/
  store.ts              # Upstash Redis REST + 인메모리 fallback (MGET 히스토리)
  history.ts            # 히스토리 정리·인기 간식 계산
  kst.ts                # KST 날짜/시간 계산
  types.ts              # 공용 타입·상수 (상태·반응 메타데이터 포함)
  teams.ts              # Teams 웹훅 (도착·품절) · 사진 미리보기·버튼 카드
  push.ts               # 휴대폰 푸시(web-push) — VAPID 설정·도착 알림 발송·만료 구독 정리
  site.ts               # 배포된 사이트 주소 계산 (링크·미리보기용)
  browser.ts            # 이미지 압축·알림·서비스 워커·푸시 구독
public/
  sw.js                 # 서비스 워커 (설치 조건 + 푸시 알림 표시 + 알림 클릭 + 오프라인 안내 · /api 는 캐시 금지)
  manifest.json         # 웹 앱 매니페스트 (이름·아이콘·standalone)
  offline.html          # 오프라인일 때 보여 주는 안내 화면
  icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
  og-image.png          # 링크 미리보기 (1200×630)
```

## 라이선스

MIT
