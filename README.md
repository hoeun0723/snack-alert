# 🍪 오늘 간식 왔나요?

회사 탕비실 간식이 **도착했는지 아닌지**를 팀원 모두가 한 화면에서 보고, 도착하는 순간 **브라우저 알림**으로 알려주는 아주 작은 웹사이트입니다.

- 주소 하나만 팀 단톡방에 붙여넣으면 끝 (로그인·비밀번호 없음)
- 누구나 "🍪 도착했어요 / ⏳ 아직 안 왔어요"를 바꿀 수 있어요
- 간식 종류·한 줄 메모·사진도 함께 남길 수 있어요
- 매일 **KST 자정**에 새 날짜로 자동 전환되고, 어제 기록은 따로 표시됩니다
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

## 3단계 · 브라우저 알림 켜기

1. 사이트 오른쪽 위 **🔔 알림 켜기** 버튼을 누르고, 브라우저가 물어보는 **허용**을 선택합니다.
2. 그 화면을 켜둔 채로 누군가 **“🍪 도착했어요”** 를 누르면, **15초 안에** 데스크톱·노트북에 알림이 뜹니다.

알아두면 좋은 점:

- 알림은 **사이트 화면이 열려 있을 때** 동작해요. (별도 푸시 서버 없이 15초마다 `/api/status` 를 확인하는 방식)
- 화면이 백그라운드로 가면 확인 주기가 60초로 느려져요. 무료 Redis 명령 한도를 아끼기 위한 장치입니다.
- **아이폰 사파리**는 iOS 16.4 이상에서 **공유 → 홈 화면에 추가** 후 그 아이콘으로 열었을 때만 알림을 켤 수 있어요.
- 알림이 안 보이면 주소창 왼쪽 자물쇠(사이트 설정) → **알림 → 허용** 으로 바꿔주세요.

---

## (선택) Microsoft Teams 로도 알림 보내기

Vercel 프로젝트 **Settings → Environment Variables** 에 `TEAMS_WEBHOOK_URL` 을 추가하고 Redeploy 하면,
누군가 “도착했어요”를 등록하는 순간 Teams 채널로도 메시지가 갑니다.

- Teams 채널 → **⋯ → Workflows(워크플로)** → “웹훅 요청이 수신되면 채널에 게시” 템플릿으로 만든 URL을 넣으면 됩니다.
- 예전 **Incoming Webhook**(Office 365 커넥터) URL도 함께 지원합니다.
- 환경변수를 비워두면 아무 동작도 하지 않아요.

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
- 타입 검사만: `npm run typecheck`

---

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/status` | 오늘 상태 + 어제 기록 + 저장소 모드 |
| `POST` | `/api/status` | `{ arrived?: boolean, label?: string, memo?: string, reset?: true }` |
| `GET` | `/api/photo` | 오늘 간식 사진 (없으면 404) |
| `POST` | `/api/photo` | `{ dataUrl: "data:image/jpeg;base64,..." }` |
| `DELETE` | `/api/photo` | 오늘 사진 삭제 |

상태 응답 예시:

```json
{
  "today": {
    "date": "2026-11-20",
    "arrived": true,
    "label": "마들렌 · 3층 탕비실",
    "memo": "커피랑 같이 드세요",
    "updatedAt": "2026-11-20T06:24:11.000Z",
    "hasPhoto": true,
    "photoVersion": "2026-11-20T06:25:02.000Z",
    "revision": 4
  },
  "yesterday": null,
  "storageMode": "redis",
  "todayKey": "2026-11-20"
}
```

---

## 이렇게 동작해요

- **날짜**: 모든 날짜 계산은 `Asia/Seoul` 기준입니다. 저장 키가 `snack:status:2026-11-20` 형태라서 **자정이 지나면 자동으로 새 날짜**로 시작하고, 이전 날짜는 “어제 기록”으로 읽습니다. (보관 14일)
- **사진**: 고른 사진을 브라우저에서 **긴 변 800px 이하 JPEG(≈200KB)** 로 줄여서 저장합니다. 파일 서버 없이 Redis 문자열로 보관해요.
- **동시 수정**: 마지막에 저장한 사람의 값이 남는 방식(라스트 라이트 윈)입니다. 팀 규모의 간식 알림에는 충분해요.
- **알림 중복 방지**: 브라우저는 “아직 안 왔어요 → 도착했어요”로 바뀐 순간에만 알림을 띄웁니다. 새로고침해도 이미 도착한 상태면 알림이 오지 않아요.
- **저장 실패 시**: 상단에 빨간 안내가 뜨고, 다음 폴링에서 자동으로 다시 시도합니다.

## 폴더 구조

```
app/
  api/status/route.ts   # 오늘/어제 상태 조회·수정
  api/photo/route.ts    # 사진 등록·조회·삭제
  page.tsx, layout.tsx, globals.css, icon.svg
components/
  SnackBoard.tsx        # 화면 전체 (버튼·폼·사진·알림·폴링)
lib/
  store.ts              # Upstash Redis REST + 인메모리 fallback
  kst.ts                # KST 날짜/시간 계산
  types.ts              # 공용 타입·상수
  teams.ts              # Teams 웹훅 (선택)
  browser.ts            # 이미지 압축·알림·서비스 워커
public/
  sw.js, manifest.json, icon-*.png
```

## 라이선스

MIT
