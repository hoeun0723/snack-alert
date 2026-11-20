"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  EMPTY_LABEL_MESSAGE,
  MAX_LABEL_LENGTH,
  MAX_MEMO_LENGTH,
  type DayView,
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

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "네트워크가 잠깐 끊겼어요. 자동으로 다시 시도합니다.";
  }
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}

export default function SnackBoard() {
  const [today, setToday] = useState<DayView | null>(null);
  const [yesterday, setYesterday] = useState<DayView | null>(null);
  const [mode, setMode] = useState<StorageMode>("memory");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [labelDraft, setLabelDraft] = useState("");
  const [memoDraft, setMemoDraft] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [alertsOn, setAlertsOn] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const labelRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArrivedRef = useRef<boolean | null>(null);
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

  const applyStatus = useCallback(
    (payload: StatusPayload, options: { announce?: boolean } = {}) => {
      const day = payload.today;
      const previousArrived = lastArrivedRef.current;

      if (options.announce !== false && previousArrived === false && day.arrived) {
        announceArrival(day);
      }
      lastArrivedRef.current = day.arrived;

      setToday(day);
      setMode(payload.storageMode);
      if (payload.yesterday !== undefined) setYesterday(payload.yesterday);

      setPhotoUrl(
        day.hasPhoto
          ? `/api/photo?v=${encodeURIComponent(day.photoVersion ?? "now")}`
          : null,
      );

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
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

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

  async function setArrived(arrived: boolean) {
    if (busy || !today) return;
    setBusy(true);
    try {
      const body: StatusUpdateBody = { arrived };
      if (labelDraft.trim() !== today.label) body.label = labelDraft;
      if (memoDraft.trim() !== today.memo) body.memo = memoDraft;

      const payload = await sendJson("/api/status", { method: "POST", body: JSON.stringify(body) });
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
      setSyncError(null);
      notify(
        today.arrived === arrived
          ? "저장했어요."
          : arrived
            ? "도착했어요! 🍪 팀원 화면에도 곧 표시돼요."
            : "아직 안 왔어요로 바꿨어요 ⏳",
      );
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
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
    if (!window.confirm("오늘 기록(도착 여부·메모·사진)을 모두 지울까요?")) return;
    setBusy(true);
    try {
      const payload = await sendJson("/api/status", {
        method: "POST",
        body: JSON.stringify({ reset: true }),
      });
      lastArrivedRef.current = false;
      applyStatus(payload, { announce: false });
      setLastSyncAt(Date.now());
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

  const arrived = today?.arrived ?? false;
  const dateLabel = today ? kstDateLabel(today.date) : "";

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

        <div className={arrived ? "hero hero--arrived" : "hero hero--waiting"}>
          <SnackBuddy arrived={arrived} />
          <p className="hero__status" aria-live="polite">
            {loading && !today ? "불러오는 중…" : arrived ? "도착했어요!" : "아직 안 왔어요"}
          </p>
          <p className="hero__detail">
            {loading && !today
              ? "잠시만요"
              : arrived
                ? today?.label || "얼른 가서 드세요!"
                : today?.label || EMPTY_LABEL_MESSAGE}
          </p>
          {today?.memo ? <p className="hero__memo">{today.memo}</p> : null}
        </div>

        <div className="switch" role="group" aria-label="간식 도착 여부">
          <button
            type="button"
            className={!arrived ? "switch__button is-active" : "switch__button"}
            aria-pressed={!arrived}
            disabled={busy || !today}
            onClick={() => void setArrived(false)}
          >
            <span aria-hidden="true">⏳</span> 아직 안 왔어요
          </button>
          <button
            type="button"
            className={arrived ? "switch__button is-active" : "switch__button"}
            aria-pressed={arrived}
            disabled={busy || !today}
            onClick={() => void setArrived(true)}
          >
            <span aria-hidden="true">🍪</span> 도착했어요
          </button>
        </div>

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="photo__image" src={photoUrl} alt="오늘의 간식 사진" />
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

          {yesterday?.updatedAt ? (
            <p className="yesterday">
              어제 · {yesterday.arrived ? "도착 🍪" : "안 옴 ⏳"}
              {yesterday.label ? ` · ${yesterday.label}` : ""} · {kstTimeLabel(yesterday.updatedAt)}
            </p>
          ) : null}

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

      {notice ? (
        <p className="toast" role="status" key={notice.id}>
          {notice.text}
        </p>
      ) : null}
    </main>
  );
}
