"use client";

import { useEffect, useId, useRef, type TouchEvent as ReactTouchEvent } from "react";

export interface LightboxPhoto {
  /** 사진 id (키·캐시 무효화에 씀) */
  id: string;
  /** 크게 볼 사진 주소 */
  src: string;
  /** 사진 설명 (스크린리더용) */
  alt: string;
  /** 사진을 올린 시각 같은 작은 안내 */
  stamp?: string | null;
}

export interface PhotoLightboxProps {
  /** 오늘 올린 사진들 (올린 순서) */
  photos: LightboxPhoto[];
  /** 지금 크게 보고 있는 사진의 순번 (0부터) */
  index: number;
  /** 사진 아래 한 줄 — 간식 이름 등. 없으면 "오늘의 간식 사진"으로 대신합니다. */
  caption?: string | null;
  /** 다른 사진으로 넘길 때 */
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** 스와이프로 넘겼다고 볼 최소 이동 거리(px) */
const SWIPE_THRESHOLD = 48;

/**
 * 간식 사진을 화면 가득 크게 보는 라이트박스.
 * - 사진은 잘리지 않고 화면 안에 꽉 차게(object-fit: contain) 보여 줍니다.
 * - 사진이 여러 장이면 좌우 버튼 · ←/→ 키 · 좌우 스와이프로 넘길 수 있습니다.
 * - 우측 상단 ✕ · 바깥 배경 클릭 · ESC 키로 닫힙니다.
 * - 열려 있는 동안 뒤 화면 스크롤을 잠그고, 닫히면 누르기 전 자리로 포커스가 돌아갑니다.
 * - 확인 팝업(ConfirmDialog)과 같은 결의 어두운 배경 + 크림색 카드 톤을 씁니다.
 */
export default function PhotoLightbox({
  photos,
  index,
  caption = null,
  onIndexChange,
  onClose,
}: PhotoLightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const titleId = useId();

  const total = photos.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const current = photos[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < total - 1;

  // 키보드 처리기는 한 번만 등록하고, 최신 값은 ref 로 읽습니다.
  const stateRef = useRef({ safeIndex, total, onClose, onIndexChange });
  useEffect(() => {
    stateRef.current = { safeIndex, total, onClose, onIndexChange };
  }, [safeIndex, total, onClose, onIndexChange]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    // 뒤 화면이 같이 스크롤되지 않도록 잠급니다.
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const state = stateRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        state.onClose();
        return;
      }

      if (state.total > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const next = state.safeIndex + (event.key === "ArrowRight" ? 1 : -1);
        if (next >= 0 && next < state.total) {
          event.preventDefault();
          state.onIndexChange(next);
        }
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
  }, []);

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? startX;
    const distance = endX - startX;
    if (Math.abs(distance) < SWIPE_THRESHOLD) return;
    if (distance < 0 && hasNext) onIndexChange(safeIndex + 1);
    if (distance > 0 && hasPrev) onIndexChange(safeIndex - 1);
  }

  if (!current) return null;

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

      <div
        className="lightbox__body"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="lightbox__stage">
          {total > 1 ? (
            <button
              type="button"
              className="lightbox__nav lightbox__nav--prev"
              onClick={() => onIndexChange(safeIndex - 1)}
              disabled={!hasPrev}
              aria-label="이전 사진"
            >
              <span aria-hidden="true">‹</span>
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            className="lightbox__image"
            src={current.src}
            alt={current.alt}
            draggable={false}
          />

          {total > 1 ? (
            <button
              type="button"
              className="lightbox__nav lightbox__nav--next"
              onClick={() => onIndexChange(safeIndex + 1)}
              disabled={!hasNext}
              aria-label="다음 사진"
            >
              <span aria-hidden="true">›</span>
            </button>
          ) : null}
        </div>

        <p className="lightbox__caption" id={titleId}>
          <span className="lightbox__label">{caption?.trim() || "오늘의 간식 사진"}</span>
          {total > 1 ? (
            <span className="lightbox__counter" aria-label={`${total}장 중 ${safeIndex + 1}번째`}>
              {safeIndex + 1} / {total}
            </span>
          ) : null}
          {current.stamp ? (
            <span className="lightbox__stamp">
              <span aria-hidden="true">📸</span> {current.stamp}
            </span>
          ) : null}
          <span className="lightbox__hint" aria-hidden="true">
            {total > 1 ? "← → 또는 좌우로 넘겨 보기 · ESC 닫기" : "ESC 또는 바깥을 눌러 닫기"}
          </span>
        </p>
      </div>
    </div>
  );
}
