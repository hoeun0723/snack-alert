"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LightboxPhoto } from "@/components/PhotoLightbox";

export interface PhotoCarouselProps {
  /** 보여 줄 사진들 (올린 순서) */
  photos: LightboxPhoto[];
  /** 사진을 눌러 크게 볼 때 (지금 보고 있는 순번) */
  onOpen: (index: number) => void;
  /** 사진 지우기 — 넘기면 지금 보이는 사진에 ✕ 버튼이 붙습니다 (히스토리에서는 넘기지 않습니다) */
  onRemove?: (id: string) => void;
  /** 지우기 버튼 잠금 (사진 올리는 중) */
  busy?: boolean;
  /** 히스토리 펼침처럼 좁은 자리에서 쓰는 작은 크기 */
  compact?: boolean;
  /** 사진 아래 한 줄 안내 */
  note?: string | null;
}

/**
 * 간식 사진 여러 장을 옆으로 넘겨 보는 캐러셀.
 * - 한 번에 사진 한 장을 크게 보여 주고, 아래로 늘어나지 않습니다.
 * - 좌우 ‹ › 버튼 · 좌우 스와이프(가로 스크롤 스냅) · 아래 점으로 넘겨 볼 수 있습니다.
 * - 사진을 누르면 PhotoLightbox 로 크게 보고, 그 창에서도 좌우로 넘길 수 있습니다.
 * - 사진이 한 장뿐이면 좌우 버튼·점 없이 한 장만 보여 줍니다.
 */
export default function PhotoCarousel({
  photos,
  onOpen,
  onRemove,
  busy = false,
  compact = false,
  note = null,
}: PhotoCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const total = photos.length;

  // 사진이 지워지거나 새로 올라와도 지금 순번이 범위를 넘지 않게 맞춥니다.
  useEffect(() => {
    setActive((previous) => Math.min(previous, Math.max(total - 1, 0)));
  }, [total]);

  /** 스크롤 위치에서 가장 가까운 사진을 지금 사진으로 봅니다. (스와이프용) */
  const readActive = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    Array.from(viewport.children).forEach((child, index) => {
      const distance = Math.abs((child as HTMLElement).offsetLeft - viewport.scrollLeft);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setActive(best);
  }, []);

  /** 순번 위치로 부드럽게 넘깁니다. */
  const goTo = useCallback((index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = viewport.children[index] as HTMLElement | undefined;
    if (!target) return;
    viewport.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    setActive(index);
  }, []);

  if (total === 0) return null;

  return (
    <div className={compact ? "carousel carousel--compact" : "carousel"}>
      <div className="carousel__stage">
        <div
          ref={viewportRef}
          className="carousel__viewport"
          onScroll={readActive}
          role="group"
          aria-roledescription="캐러셀"
          aria-label={`간식 사진 ${total}장`}
        >
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="carousel__slide"
              role="group"
              aria-roledescription="슬라이드"
              aria-label={`${total}장 중 ${index + 1}번째`}
            >
              <button
                type="button"
                className="carousel__zoom"
                onClick={() => onOpen(index)}
                aria-haspopup="dialog"
                aria-label={`${index + 1}번째 간식 사진 크게 보기`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="carousel__image"
                  src={photo.src}
                  alt={photo.alt}
                  draggable={false}
                  loading={index === 0 ? "eager" : "lazy"}
                />
                <span className="carousel__zoom-hint" aria-hidden="true">
                  🔍 크게 보기
                </span>
              </button>

              {onRemove ? (
                <button
                  type="button"
                  className="carousel__remove"
                  onClick={() => onRemove(photo.id)}
                  disabled={busy}
                  aria-label={`${index + 1}번째 사진 지우기`}
                  title="이 사진 지우기"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {total > 1 ? (
          <>
            <button
              type="button"
              className="carousel__nav carousel__nav--prev"
              onClick={() => goTo(active - 1)}
              disabled={active <= 0}
              aria-label="이전 사진"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="carousel__nav carousel__nav--next"
              onClick={() => goTo(active + 1)}
              disabled={active >= total - 1}
              aria-label="다음 사진"
            >
              <span aria-hidden="true">›</span>
            </button>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="carousel__footer">
          <div className="carousel__dots">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                className={index === active ? "carousel__dot is-active" : "carousel__dot"}
                onClick={() => goTo(index)}
                aria-label={`${index + 1}번째 사진 보기`}
                aria-current={index === active}
              />
            ))}
          </div>
          <span className="carousel__counter" aria-live="polite">
            {active + 1} / {total}
          </span>
        </div>
      ) : null}

      {note ? <p className="carousel__note">{note}</p> : null}
    </div>
  );
}
