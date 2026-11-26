"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { isAndroidDevice, isInAppBrowser, isIOSDevice, isStandaloneApp } from "@/lib/browser";

/** 설치 안내를 닫았다는 사실을 기억하는 키 (localStorage) */
const DISMISS_KEY = "snack-alert:install-dismissed";

/** 안내 탭 — 아이폰과 안드로이드는 홈 화면 추가 방법이 다릅니다. */
type Platform = "ios" | "android";

/** 크롬 계열이 설치 가능해질 때 보내는 이벤트 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * 홈 화면에 추가(앱 설치) 안내.
 *
 * - 이미 앱으로 열려 있으면(standalone) 아무것도 그리지 않습니다.
 * - 🍎 아이폰 / 🤖 안드로이드 탭으로 방법을 나눠 보여 주고, 지금 쓰는 기기 탭을 먼저 열어 둡니다.
 *   (사파리가 아닌 브라우저·카카오톡 안에서 열어도 두 방법을 다 볼 수 있습니다)
 * - 안드로이드·데스크톱 크롬은 beforeinstallprompt 를 잡아 두었다가 버튼 한 번으로 설치합니다.
 * - 닫으면 localStorage 에 기억해 다시 조르지 않습니다.
 */
export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>("android");
  const [canInstall, setCanInstall] = useState(false);
  const [inApp, setInApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandaloneApp()) return;

    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // 저장 공간이 막혀 있으면 그냥 이번 방문에만 보여 줍니다.
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferred.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
      setVisible(true);
    };

    const onInstalled = () => {
      deferred.current = null;
      setCanInstall(false);
      setVisible(false);
      try {
        window.localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // 위와 같음
      }
    };

    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayMode = () => {
      if (isStandaloneApp()) setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    standaloneQuery?.addEventListener?.("change", onDisplayMode);

    // 아이폰은 설치 이벤트가 없어서 처음부터 방법을 알려 줍니다.
    // 안드로이드도 크롬이 아니면 설치 버튼이 안 뜨므로 메뉴 방법을 함께 보여 줍니다.
    setInApp(isInAppBrowser());
    if (isIOSDevice()) {
      setPlatform("ios");
      setVisible(true);
    } else if (isAndroidDevice()) {
      setPlatform("android");
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      standaloneQuery?.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  /** 탭은 방향키로도 오갈 수 있게 합니다. (←/→) */
  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Platform = platform === "ios" ? "android" : "ios";
    setPlatform(next);
    document.getElementById(`install-tab-${next}`)?.focus();
  }

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 위와 같음
    }
  }

  async function startInstall() {
    const event = deferred.current;
    if (!event) return;

    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        deferred.current = null;
        setCanInstall(false);
        setVisible(false);
      }
    } catch {
      // 사용자가 설치 창을 닫았거나 브라우저가 막은 경우 — 아래 메뉴 방법을 보면 됩니다.
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <aside className="install" aria-label="홈 화면에 추가 안내">
      <div className="install__row">
        <span className="install__icon" aria-hidden="true">
          🍪
        </span>

        <span className="install__body">
          <span className="install__title">홈 화면에 추가하면 앱처럼 열려요</span>
          <span className="install__sub">아이폰·안드로이드는 방법이 달라요</span>
        </span>

        <button type="button" className="install__close" onClick={dismiss} aria-label="설치 안내 닫기">
          ✕
        </button>
      </div>

      <div
        className="install__tabs"
        role="tablist"
        aria-label="기기별 설치 방법"
        onKeyDown={onTabKeyDown}
      >
        <button
          type="button"
          role="tab"
          id="install-tab-ios"
          className="install__tab"
          aria-selected={platform === "ios"}
          aria-controls="install-panel-ios"
          tabIndex={platform === "ios" ? 0 : -1}
          onClick={() => setPlatform("ios")}
        >
          🍎 아이폰
        </button>
        <button
          type="button"
          role="tab"
          id="install-tab-android"
          className="install__tab"
          aria-selected={platform === "android"}
          aria-controls="install-panel-android"
          tabIndex={platform === "android" ? 0 : -1}
          onClick={() => setPlatform("android")}
        >
          🤖 안드로이드
        </button>
      </div>

      {platform === "ios" ? (
        <div
          className="install__panel"
          role="tabpanel"
          id="install-panel-ios"
          aria-labelledby="install-tab-ios"
        >
          {inApp ? (
            <p className="install__note">
              지금은 카카오톡 같은 앱 안에서 열려 있어요. 먼저 <b>Safari</b>로 열어 주세요!
            </p>
          ) : null}
          <ol className="install__steps">
            <li>
              카카오톡 등 앱 안이면 오른쪽 위 <b>···</b> → <b>Safari로 열기</b>
            </li>
            <li>
              사파리 아래 <b>공유(□↑)</b>를 눌러요 · 안 보이면 주소창 옆 <b>≡</b> / <b>···</b> →{" "}
              <b>공유</b>
            </li>
            <li>
              <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>를 누르면 끝!
            </li>
          </ol>
        </div>
      ) : (
        <div
          className="install__panel"
          role="tabpanel"
          id="install-panel-android"
          aria-labelledby="install-tab-android"
        >
          {canInstall ? (
            <div className="install__quick">
              <span>크롬이 설치를 준비했어요</span>
              <button
                type="button"
                className="install__install"
                onClick={() => void startInstall()}
                disabled={busy}
              >
                {busy ? "설치 중…" : "설치하기"}
              </button>
            </div>
          ) : null}
          <ol className="install__steps">
            {canInstall ? (
              <>
                <li>
                  위 <b>설치하기</b> 버튼을 누르면 바로 끝!
                </li>
                <li>
                  버튼이 안 보이면 오른쪽 위 <b>⋮</b> → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>
                </li>
              </>
            ) : (
              <>
                <li>
                  크롬에서 열고 오른쪽 위 <b>⋮</b> 메뉴를 눌러요 (앱 안이면 <b>다른 브라우저로 열기</b>)
                </li>
                <li>
                  <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 골라요
                </li>
              </>
            )}
            <li>
              <b>설치</b>를 누르면 홈 화면에 생겨요
            </li>
          </ol>
        </div>
      )}
    </aside>
  );
}
