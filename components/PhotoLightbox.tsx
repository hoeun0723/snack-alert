"use client";

import { useEffect, useId, useRef } from "react";

export interface PhotoLightboxProps {
  /** 크게 볼 사진 주소 */
  src: string;
  /** 사진 설명 (스크린리더용) */
  alt: string;
  /** 사진 아래 한 줄 — 간식 이름 등. 없으면 "오늘의 간식 사진"으로 대신합니다. */
  caption?: string | null;
  /** 사진을 올린 시각 같은 작은 안내 */
  stamp?: string | null;
  onClose: () => void;
}

/**
 * 간식 사진을 화면 가득 크게 보는 라이트박스.
 * - 사진은 잘리지 않고 화면 안에 꽉 차게(object-fit: contain) 보여 줍니다.
 * - 우측 상단 ✕ · 바깥 배경 클릭 · ESC 키로 닫힙니다.
 * - 열려 있는 동안 뒤 화면 스크롤을 잠그고, 닫히면 누르기 전 자리로 포커스가 돌아갑니다.
 * - 확인 팝업(ConfirmDialog)과 같은 결의 어두운 배경 + 크림색 카드 톤을 씁니다.
 */
export default function PhotoLightbox({
  src,
  alt,
  caption = null,
  stamp = null,
  onClose,
}: PhotoLightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    // 뒤 화면이 같이 스크롤되지 않도록 잠급니다.
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Tab 이 사진 창 밖으로 나가지 않게 돌려 줍니다.
      const focusable = rootRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div ref={rootRef} className="lightbox">
      <div className="lightbox__scrim" aria-hidden="true" onClick={onClose} />

      <button
        ref={closeRef}
        type="button"
        className="lightbox__close"
        onClick={onClose}
        aria-label="사진 크게 보기 닫기"
      >
        <span aria-hidden="true">✕</span>
      </button>

      <div className="lightbox__body" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lightbox__image" src={src} alt={alt} />

        <p className="lightbox__caption" id={titleId}>
          <span className="lightbox__label">{caption?.trim() || "오늘의 간식 사진"}</span>
          {stamp ? (
            <span className="lightbox__stamp">
              <span aria-hidden="true">📸</span> {stamp}
            </span>
          ) : null}
          <span className="lightbox__hint" aria-hidden="true">
            ESC 또는 바깥을 눌러 닫기
          </span>
        </p>
      </div>
    </div>
  );
}
