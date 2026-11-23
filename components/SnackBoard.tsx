"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import PhotoLightbox from "@/components/PhotoLightbox";
import SnackBuddy from "@/components/SnackBuddy";
import {
  compressImageToDataUrl,
  isIOSDevice,
  isStandaloneApp,
  notificationsSupported,
  registerServiceWorker,
  showSnackNotification,
} from "@/lib/browser";
import { kstDateLabel, kstTimeLabel, relativeTime } from "@/lib/kst";
import {
  MAX_LABEL_LENGTH,
  MAX_MEMO_LENGTH,
  REACTIONS,
  reactionTotal,
  SNACK_STATUSES,
  STATUS_META,
  type DayView,
  type HistoryResponse,
  type PopularSnack,
  type ReactionKey,
  type SnackStatus,
  type StatusUpdateBody,
  type StorageMode,
} from "@/lib/types";

/** 화면이 보일 때 15초, 백그라운드일 때 60초마다 확인 (무료 Redis 명령 한도를 아끼기 위해) */
const POLL_VISIBLE_MS = 15_000;
const POLL_HIDDEN_MS = 60_000;
const ALERTS_KEY = "snack-alert:alerts";

interface StatusPayload {
  today: DayView;
  yesterday?: DayView | null;
  storageMode: StorageMode;
  todayKey?: string;
  error?: string;
}

type Notice = { id: number; text: string };

/** Teams 알림이 나가는 상태 변경 — 확인 팝업에서 한 번 더 물어봅니다. */
type PendingChange = { next: SnackStatus; kind: "arrived" | "sold_out" };

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "네트워크가 잠깐 끊겼어요. 자동으로 다시 시도합니다.";
  }
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}

/** 상태별 큰 카드 색상 클래스 (sold_out 은 hero--sold) */
function heroClass(status: SnackStatus): string {
  return status === "sold_out" ? "hero hero--sold" : `hero hero--${status}`;
}

export default function SnackBoard() {
  const [today, setToday] = useState<DayView | null>(null);
  const [mode, setMode] = useState<StorageMode>("memory");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [sending, setSending] = useState(false);
  const [reacting, setReacting] = useState<ReactionKey | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [history, setHistory] = useState<DayView[]>([]);
  const [popular, setPopular] = useState<PopularSnack | null>(null);

  const [labelDraft, setLabelDraft] = useState("");
  const [memoDraft, setMemoDraft] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** 간식 사진을 크게 보는 라이트박스가 열려 있는지 */
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [alertsOn, setAlertsOn] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const labelRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatusRef = useRef<SnackStatus | null>(null);
  const alertsOnRef = useRef(false);

  useEffect(() => {
    alertsOnRef.current = alertsOn;
  }, [alertsOn]);

  const notify = useCallback((text: string) => {
    setNotice({ id: Date.now(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const announceArrival = useCallback((day: DayView) => {
    if (!alertsOnRef.current) return;
    const parts = [day.label, day.memo].filter((part) => part.trim().length > 0);
    void showSnackNotification(
      "🍪 간식 도착했어요!",
      parts.length > 0 ? parts.join(" · ") : "탕비실 확인하러 가세요!",
    );
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as HistoryResponse;
      setHistory(Array.isArray(payload.history) ? payload.history : []);
      setPopular(payload.popular ?? null);
    } catch {
      // 히스토리는 보조 정보라서 실패해도 조용히 넘어갑니다. (다음 새로고침에서 다시 시도)
    }
  }, []);

  const applyStatus = useCallback(
    (payload: StatusPayload, options: { announce?: boolean } = {}) => {
      const day = payload.today;
      const previousStatus = lastStatusRef.current;

      if (options.announce !== false && previousStatus !== null && previousStatus !== "arrived" && day.status === "arrived") {
        announceArrival(day);
      }
      lastStatusRef.current = day.status;

      setToday(day);
      setMode(payload.storageMode);

      setPhotoUrl(
        day.hasPhoto
          ? `/api/photo?v=${encodeURIComponent(day.photoVersion ?? "now")}`
          : null,
      );
      // 사진이 지워지면 열려 있던 크게 보기 창도 함께 닫습니다.
      if (!day.hasPhoto) setLightboxOpen(false);

      if (document.activeElement !== labelRef.current) setLabelDraft(day.label);
      if (document.activeElement !== memoRef.current) setMemoDraft(day.memo);
    },
    [announceArrival],
  );

  const refresh = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setSyncing(true);
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        const payload = (await response.json()) as StatusPayload;
        if (!response.ok) throw new Error(payload.error ?? "상태를 불러오지 못했어요.");
        applyStatus(payload);
        setSyncError(null);
        setLastSyncAt(Date.now());
        setNow(Date.now());
      } catch (error) {
        setSyncError(errorMessage(error));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [applyStatus],
  );

  // 첫 로드 + 자동 새로고침
  useEffect(() => {
    void refresh();
    void refreshHistory();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      await refresh({ silent: true });
      if (cancelled) return;
      const delay = document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
      timer = setTimeout(() => void tick(), delay);
    };

    timer = setTimeout(() => void tick(), POLL_VISIBLE_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true });
        void refreshHistory();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, refreshHistory]);

  // "3분 전" 같은 표기를 위해 주기적으로 시계를 갱신
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  // 알림 권한 / 서비스 워커 준비
  useEffect(() => {
    if (!notificationsSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    const stored = window.localStorage.getItem(ALERTS_KEY) === "on";
    setAlertsOn(stored && Notification.permission === "granted");
    setIosHint(isIOSDevice() && !isStandaloneApp());
    void registerServiceWorker();
  }, []);

  async function toggleAlerts() {
    if (!notificationsSupported()) {
      notify("이 브라우저는 알림을 지원하지 않아요. 화면을 열어두면 자동으로 확인해요.");
      return;
    }

    if (Notification.permission === "granted") {
      const next = !alertsOn;
      setAlertsOn(next);
      window.localStorage.setItem(ALERTS_KEY, next ? "on" : "off");
      if (next) {
        await registerServiceWorker();
        await showSnackNotification("알림을 켰어요 🍪", "간식이 도착하면 이 컴퓨터로 바로 알려드릴게요.");
      }
      notify(next ? "알림을 켰어요 🔔" : "알림을 잠시 꺼뒀어요 🔕");
      return;
    }

    if (Notification.permission === "denied") {
      notify("브라우저 설정에서 이 사이트의 알림을 허용해 주세요.");
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      setAlertsOn(true);
      window.localStorage.setItem(ALERTS_KEY, "on");
      await registerServiceWorker();
      await showSnackNotification("알림을 켰어요 🍪", "간식이 도착하면 이 컴퓨터로 바로 알려드릴게요.");
      notify("알림을 켰어요 🔔");
    } else {
      notify("알림이 허용되지 않았어요. 나중에 다시 켤 수 있어요.");
    }
  }

  async function sendJson(url: string, init: RequestInit): Promise<StatusPayload> {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as StatusPayload;
    if (!response.ok) throw new Error(payload.error ?? "잠시 후 다시 시도해 주세요.");
    return payload;
  }

  async function setStatus(next: SnackStatus) {
    if (busy || !today) return;
    setBusy(true);
    try {
      const body: StatusUpdateBody = { status: next };
      if (labelDraft.trim() !== today.label) body.label = labelDraft.trim();
      if (memoDraft.trim() !== today.memo) body.memo = memoDraft.trim();

      const payload = await sendJson("/api/status", { method: "POST", body: JSON.stringify(body) });
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
      setSyncError(null);
      void refreshHistory();

      const meta = STATUS_META[next];
      notify(
        today.status === next
          ? "저장했어요."
          : next === "arrived"
            ? "도착했어요! 🍪 팀원 화면에도 곧 표시돼요."
            : next === "sold_out"
              ? `${meta.emoji} ${meta.label}로 바꿨어요. 팀원 화면에도 곧 표시돼요.`
              : "아직 안 왔어요로 바꿨어요 ⏳",
      );
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /**
   * 이 상태로 바꿀 때 Teams 알림이 실제로 나가는지 봅니다.
   * (서버의 app/api/status/route.ts 와 같은 규칙)
   *  - arrived  : "도착했어요"가 아닌 상태에서 arrived 로 바뀌는 순간
   *  - sold_out : "도착했어요"에서 sold_out 으로 바뀌는 순간 (하루 1회)
   */
  function teamsNoticeFor(next: SnackStatus): PendingChange["kind"] | null {
    if (!today || next === today.status) return null;
    if (next === "arrived") return "arrived";
    if (next === "sold_out" && today.status === "arrived" && !today.soldOutNotifiedAt) {
      return "sold_out";
    }
    return null;
  }

  /** 상태 버튼: Teams 알림이 나가는 경우에만 먼저 확인 팝업을 띄웁니다. */
  function requestStatus(next: SnackStatus) {
    if (busy || sending || !today) return;
    const kind = teamsNoticeFor(next);
    if (!kind) {
      void setStatus(next);
      return;
    }
    setPendingChange({ next, kind });
  }

  const closePending = useCallback(() => {
    if (sending) return;
    setPendingChange(null);
  }, [sending]);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  async function confirmPending() {
    if (!pendingChange || sending) return;
    setSending(true);
    try {
      await setStatus(pendingChange.next);
    } finally {
      setSending(false);
      setPendingChange(null);
    }
  }

  async function react(type: ReactionKey) {
    if (reacting || !today) return;
    setReacting(type);
    try {
      const payload = await sendJson("/api/reaction", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      applyStatus(payload, { announce: false });
      void refreshHistory();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setReacting(null);
    }
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !today) return;
    setBusy(true);
    try {
      const payload = await sendJson("/api/status", {
        method: "POST",
        body: JSON.stringify({ label: labelDraft, memo: memoDraft }),
      });
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
      setSyncError(null);
      void refreshHistory();
      notify("메모를 저장했어요 ✎");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("이미지 파일만 올릴 수 있어요.");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const payload = await sendJson("/api/photo", {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      });
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
      setSyncError(null);
      notify("사진을 올렸어요 📸");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!window.confirm("오늘 사진을 지울까요?")) return;
    setUploading(true);
    try {
      const payload = await sendJson("/api/photo", { method: "DELETE" });
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
      notify("사진을 지웠어요.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function resetDay() {
    if (busy) return;
    if (!window.confirm("오늘 기록(상태·메모·사진·반응)을 모두 지울까요?")) return;
    setBusy(true);
    try {
      const payload = await sendJson("/api/status", {
        method: "POST",
        body: JSON.stringify({ reset: true }),
      });
      lastStatusRef.current = null;
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
      void refreshHistory();
      notify("오늘 기록을 초기화했어요.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("링크를 복사했어요. 팀원에게 붙여넣으세요 🔗");
    } catch {
      notify(window.location.href);
    }
  }

  const status: SnackStatus = today?.status ?? "waiting";
  const meta = STATUS_META[status];
  const reactionCounts = today?.reactions;
  const myReactionTotal = reactionCounts ? reactionTotal(reactionCounts) : 0;
  const dateLabel = today ? kstDateLabel(today.date) : "";
  // 왕관은 인기 간식이 나온 날 중 가장 최근 줄에만 붙입니다. (같은 간식이 반복돼도 한 번만)
  const popularTopDate = popular
    ? (history.find((day) => day.label.trim() === popular.label)?.date ?? null)
    : null;

  const syncLabel = syncError
    ? syncError
    : lastSyncAt
      ? `${relativeTime(new Date(lastSyncAt).toISOString(), now)} 확인`
      : "확인 중…";

  return (
    <main className="page">
      <div className="page__glow" aria-hidden="true" />

      <section className="board" aria-labelledby="board-title">
        <header className="board__header">
          <div>
            <p className="board__eyebrow">탕비실 소식</p>
            <h1 className="board__title" id="board-title">
              오늘 간식 왔나요?
            </h1>
            <p className="board__date">
              {dateLabel}
              <span className="board__sep" aria-hidden="true">
                ·
              </span>
              <span className={syncError ? "board__sync board__sync--error" : "board__sync"}>
                {syncing && !lastSyncAt ? "확인 중…" : syncLabel}
              </span>
            </p>
          </div>

          <button
            type="button"
            className={alertsOn ? "bell bell--on" : "bell"}
            onClick={() => void toggleAlerts()}
            aria-pressed={alertsOn}
            title="간식이 도착하면 브라우저 알림으로 알려드려요"
          >
            <span aria-hidden="true">{alertsOn ? "🔔" : "🔕"}</span>
            <span>{alertsOn ? "알림 켜짐" : "알림 켜기"}</span>
          </button>
        </header>

        <div className={heroClass(status)}>
          <SnackBuddy status={status} />
          <p className="hero__status" aria-live="polite">
            {loading && !today ? "불러오는 중…" : meta.hero}
          </p>
          <p className="hero__detail">
            {loading && !today ? "잠시만요" : today?.label || meta.emptyLabel}
          </p>
          {today?.memo ? <p className="hero__memo">{today.memo}</p> : null}
        </div>

        <div className="switch" role="group" aria-label="오늘 간식 상태">
          {SNACK_STATUSES.map((value) => {
            const item = STATUS_META[value];
            const active = status === value;
            return (
              <button
                key={value}
                type="button"
                data-status={value}
                className={active ? "switch__button is-active" : "switch__button"}
                aria-pressed={active}
                disabled={busy || !today}
                onClick={() => requestStatus(value)}
              >
                <span aria-hidden="true">{item.emoji}</span> {item.label}
              </button>
            );
          })}
        </div>

        <section className="reactions" aria-labelledby="reactions-title">
          <div className="reactions__head">
            <h2 className="reactions__title" id="reactions-title">
              오늘 간식 어땠어요?
            </h2>
            <span className="reactions__total">
              {myReactionTotal > 0 ? `반응 ${myReactionTotal}개` : "첫 반응을 남겨보세요"}
            </span>
          </div>
          <div className="reactions__list">
            {REACTIONS.map((item) => {
              const count = reactionCounts?.[item.key] ?? 0;
              const active = count > 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={active ? "reaction reaction--on" : "reaction"}
                  onClick={() => void react(item.key)}
                  disabled={!today || reacting !== null}
                  aria-label={`${item.label} 반응 남기기 (지금 ${count}개)`}
                >
                  <span className="reaction__emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="reaction__label">{item.label}</span>
                  <span className="reaction__count">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        <form className="details" onSubmit={saveDetails}>
          <label className="field">
            <span className="field__label">간식 종류</span>
            <input
              ref={labelRef}
              className="field__input"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              maxLength={MAX_LABEL_LENGTH}
              placeholder="마들렌 · 3층 탕비실"
              enterKeyHint="done"
            />
          </label>

          <label className="field">
            <span className="field__label">한 줄 메모</span>
            <input
              ref={memoRef}
              className="field__input"
              value={memoDraft}
              onChange={(event) => setMemoDraft(event.target.value)}
              maxLength={MAX_MEMO_LENGTH}
              placeholder="커피랑 같이 드세요 (선택)"
              enterKeyHint="done"
            />
          </label>

          <button type="submit" className="save" disabled={busy || !today}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </form>

        <section className="photo" aria-labelledby="photo-title">
          <div className="photo__head">
            <h2 className="photo__title" id="photo-title">
              오늘의 간식 사진
            </h2>
            {today?.hasPhoto && today.photoVersion ? (
              <span className="photo__stamp">{kstTimeLabel(today.photoVersion)}</span>
            ) : null}
          </div>

          {photoUrl ? (
            <div className="photo__frame">
              <button
                type="button"
                className="photo__zoom"
                onClick={() => setLightboxOpen(true)}
                aria-haspopup="dialog"
                aria-label="오늘의 간식 사진 크게 보기"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="photo__image" src={photoUrl} alt="오늘의 간식 사진" />
                <span className="photo__zoom-hint" aria-hidden="true">
                  <span className="photo__zoom-icon">🔍</span> 눌러서 크게 보기
                </span>
              </button>
              <div className="photo__actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  다른 사진
                </button>
                <button
                  type="button"
                  className="ghost ghost--danger"
                  onClick={() => void removePhoto()}
                  disabled={uploading}
                >
                  지우기
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="photo__drop"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <span className="photo__drop-icon" aria-hidden="true">
                📷
              </span>
              <span className="photo__drop-text">{uploading ? "올리는 중…" : "사진 올리기"}</span>
              <small className="photo__drop-hint">800px 이하로 가볍게 줄여서 저장해요</small>
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => {
              void handlePhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </section>

        <section className="history" aria-labelledby="history-title">
          <div className="history__head">
            <h2 className="history__title" id="history-title">
              📅 최근 간식 히스토리
            </h2>
            {popular ? (
              <span className="history__popular" title={`${popular.label} · 반응 ${popular.total}개`}>
                <span aria-hidden="true">👑</span> {popular.label} · {popular.total}개
              </span>
            ) : null}
          </div>

          {history.length > 0 ? (
            <ul className="history__list">
              {history.map((day) => {
                const dayMeta = STATUS_META[day.status];
                const total = reactionTotal(day.reactions);
                const isToday = day.date === today?.date;
                const isPopular = popularTopDate !== null && day.date === popularTopDate;
                return (
                  <li key={day.date} className={`history__item history__item--${day.status}`}>
                    <span className="history__badge" aria-hidden="true">
                      {dayMeta.emoji}
                    </span>

                    <div className="history__main">
                      <p className="history__date">
                        {isToday ? "오늘 · " : ""}
                        {kstDateLabel(day.date)}
                        <span className="history__status-text"> · {dayMeta.label}</span>
                      </p>
                      <p className="history__label">
                        {isPopular ? (
                          <span className="history__crown" aria-label="인기 간식">
                            👑
                          </span>
                        ) : null}
                        {day.label || dayMeta.emptyLabel}
                      </p>
                      {day.memo ? <p className="history__memo">{day.memo}</p> : null}
                    </div>

                    <div className="history__reactions">
                      {total > 0 ? (
                        REACTIONS.filter((item) => (day.reactions[item.key] ?? 0) > 0).map((item) => (
                          <span key={item.key} className="history__reaction">
                            <span aria-hidden="true">{item.emoji}</span>
                            {(day.reactions[item.key] ?? 0).toString()}
                          </span>
                        ))
                      ) : (
                        <span className="history__none">반응 없음</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="history__empty">
              아직 기록이 없어요. 오늘 간식 상태를 남기면 여기에 하루씩 쌓여요.
            </p>
          )}
        </section>

        <footer className="board__footer">
          <p className="meta">
            <span className={`meta__dot meta__dot--${mode}`} aria-hidden="true" />
            {mode === "redis" ? "팀 전체가 같은 상태를 보고 있어요" : "지금은 임시 저장 모드예요"}
          </p>

          {mode === "memory" ? (
            <p className="hint">
              Vercel에서 Storage → Upstash Redis(무료)를 연결하면 팀원 모두가 같은 상태를 실시간으로
              봅니다. README 2단계를 따라 1분이면 끝나요.
            </p>
          ) : null}

          <p className="hint">
            {permission === "unsupported"
              ? "이 브라우저는 알림을 지원하지 않아요. 화면을 열어두면 15초마다 자동으로 확인합니다."
              : iosHint
                ? "아이폰은 공유 → ‘홈 화면에 추가’ 후에 알림을 켤 수 있어요. (iOS 16.4+)"
                : "알림은 이 화면이 열려 있을 때 15초마다 확인해서 알려드려요. 알림이 안 뜨면 주소창 옆 설정에서 허용해 주세요."}
          </p>

          <div className="footnotes">
            {today?.updatedAt ? (
              <span>
                마지막 기록 {relativeTime(today.updatedAt, now)} · {kstTimeLabel(today.updatedAt)}
              </span>
            ) : (
              <span>오늘은 아직 기록이 없어요</span>
            )}
            <button type="button" className="link" onClick={() => void copyLink()}>
              링크 복사
            </button>
            <button type="button" className="link link--muted" onClick={() => void resetDay()} disabled={busy}>
              오늘 기록 초기화
            </button>
          </div>
        </footer>
      </section>

      {lightboxOpen && photoUrl ? (
        <PhotoLightbox
          src={photoUrl}
          alt={today?.label?.trim() ? `오늘의 간식 사진 — ${today.label.trim()}` : "오늘의 간식 사진"}
          caption={today?.label ?? null}
          stamp={today?.photoVersion ? kstTimeLabel(today.photoVersion) : null}
          onClose={closeLightbox}
        />
      ) : null}

      {pendingChange ? (
        <ConfirmDialog
          emoji={pendingChange.kind === "arrived" ? "🍪" : "💨"}
          tone={pendingChange.kind}
          title={
            pendingChange.kind === "arrived" ? "팀에 도착 알림을 보낼까요?" : "팀에 품절 알림을 보낼까요?"
          }
          message={
            pendingChange.kind === "arrived"
              ? "팀 전체에 간식 도착 알림이 전송됩니다. 정말 등록할까요?"
              : "팀 전체에 품절 알림이 전송됩니다. 정말 변경할까요?"
          }
          detail={labelDraft.trim() ? `오늘 간식: ${labelDraft.trim()}` : null}
          hint={pendingChange.kind === "sold_out" ? "품절 알림은 하루에 한 번만 전송돼요." : null}
          confirmLabel={pendingChange.kind === "arrived" ? "알림 보내기" : "변경하기"}
          busyLabel={pendingChange.kind === "arrived" ? "보내는 중…" : "바꾸는 중…"}
          busy={sending}
          onCancel={closePending}
          onConfirm={() => void confirmPending()}
        />
      ) : null}

      {notice ? (
        <p className="toast" role="status" key={notice.id}>
          {notice.text}
        </p>
      ) : null}
    </main>
  );
}
