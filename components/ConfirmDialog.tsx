"use client";

import { useEffect, useId, useRef, type MouseEvent as ReactMouseEvent } from "react";

export interface ConfirmDialogProps {
  /** 카드 위쪽 동그라미에 들어갈 이모지 */
  emoji: string;
  /** 굵은 제목 */
  title: string;
  /** 무슨 일이 일어나는지 알려주는 본문 */
  message: string;
  /** 확인에 도움이 되는 한 줄 (간식 이름 등). 없으면 숨깁니다. */
  detail?: string | null;
  /** 작은 안내 문구 (하루 1회 같은 조건) */
  hint?: string | null;
  /** 확인 버튼 이름 */
  confirmLabel: string;
  /** 확인 버튼을 누른 뒤 처리 중일 때 보여줄 이름 */
  busyLabel?: string;
  /** 색감: 도착(따뜻한 노랑) / 품절(차분한 베이지) */
  tone?: "arrived" | "sold_out";
  cancelLabel?: string;
  /** 요청을 보내는 중이면 버튼을 잠급니다 */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Teams 알림이 나가는 동작 앞에 한 번 물어보는 확인 팝업.
 * - 바깥 배경 클릭 · ESC 키로 닫힙니다. (보내는 중에는 잠깐 잠급니다)
 * - 열릴 때는 "취소"에 포커스, 닫히면 누르기 전 자리로 돌아갑니다.
 * - 좁은 화면에서는 아래에서 올라오는 시트처럼 보입니다.
 */
export default function ConfirmDialog({
  emoji,
  title,
  message,
  detail = null,
  hint = null,
  confirmLabel,
  busyLabel = "보내는 중…",
  tone = "arrived",
  cancelLabel = "취소",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    // 뒤 화면이 같이 스크롤되지 않도록 잠급니다.
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busy) return;
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      // Tab 이 팝업 밖으로 나가지 않게 돌려 줍니다.
      const focusable = cardRef.current?.querySelectorAll<HTMLElement>(
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
  }, [busy, onCancel]);

  // 카드 바깥(배경)을 누르면 닫습니다.
  function handlePointerDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (busy) return;
    if (cardRef.current?.contains(event.target as Node)) return;
    onCancel();
  }

  return (
    <div className={tone === "sold_out" ? "modal modal--sold" : "modal"} onMouseDown={handlePointerDown}>
      <div className="modal__scrim" aria-hidden="true" />
      <div
        ref={cardRef}
        className="modal__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <span className="modal__emoji" aria-hidden="true">
          {emoji}
        </span>
        <h2 className="modal__title" id={titleId}>
          {title}
        </h2>
        <p className="modal__message" id={messageId}>
          {message}
        </p>
        {detail ? <p className="modal__detail">{detail}</p> : null}
        {hint ? <p className="modal__hint">{hint}</p> : null}

        <div className="modal__actions">
          <button
            ref={cancelRef}
            type="button"
            className="modal__button modal__button--cancel"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="modal__button modal__button--confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
