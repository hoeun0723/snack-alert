"use client";

import { useEffect, useRef, useState } from "react";

import { isIOSSafari, isStandaloneApp } from "@/lib/browser";

/** 설치 안내를 닫았다는 사실을 기억하는 키 (localStorage) */
const DISMISS_KEY = "snack-alert:install-dismissed";

/** 크롬 계열이 설치 가능해질 때 보내는 이벤트 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * 홈 화면에 추가(앱 설치) 안내.
 *
 * - 이미 앱으로 열려 있으면(standalone) 아무것도 그리지 않습니다.
 * - 안드로이드·데스크톱 크롬: beforeinstallprompt 를 잡아 두었다가 버튼 한 번으로 설치
 * - 아이폰 사파리: 공유 → 홈 화면에 추가 순서를 단계별로 안내
 * - 닫으면 localStorage 에 기억해 다시 조르지 않습니다.
 */
export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"prompt" | "ios">("prompt");
  const [showSteps, setShowSteps] = useState(false);
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
      setMode("prompt");
      setVisible(true);
    };

    const onInstalled = () => {
      deferred.current = null;
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

    // 아이폰 사파리는 설치 이벤트가 없어서 처음부터 방법을 알려 줍니다.
    if (isIOSSafari()) {
      setMode("ios");
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      standaloneQuery?.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    setShowSteps(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 위와 같음
    }
  }

  async function startInstall() {
    if (mode === "ios") {
      setShowSteps((previous) => !previous);
      return;
    }

    const event = deferred.current;
    if (!event) {
      // 설치 이벤트가 아직 없으면 브라우저 메뉴 방법을 안내합니다.
      setMode("ios");
      setShowSteps(true);
      return;
    }

    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      deferred.current = null;
      setVisible(false);
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
          <span className="install__sub">
            {mode === "ios"
              ? "공유 버튼(□↑)으로 10초면 끝나요"
              : "탭 한 번이면 설치돼요 · 알림도 더 잘 와요"}
          </span>
        </span>

        <button
          type="button"
          className="install__action"
          onClick={() => void startInstall()}
          aria-expanded={mode === "ios" ? showSteps : undefined}
        >
          {mode === "ios" ? (showSteps ? "접기" : "방법 보기") : "설치"}
        </button>

        <button type="button" className="install__close" onClick={dismiss} aria-label="설치 안내 닫기">
          ✕
        </button>
      </div>

      {showSteps ? (
        mode === "ios" ? (
          <ol className="install__steps">
            <li>아래쪽 <b>공유</b> 버튼(□↑)을 눌러요</li>
            <li>목록에서 <b>홈 화면에 추가</b>를 골라요</li>
            <li>오른쪽 위 <b>추가</b>를 누르면 끝!</li>
          </ol>
        ) : (
          <ol className="install__steps">
            <li>브라우저 오른쪽 위 <b>메뉴(⋮)</b>를 열어요</li>
            <li><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 골라요</li>
            <li>확인을 누르면 홈 화면에 생겨요</li>
          </ol>
        )
      ) : null}
    </aside>
  );
}
