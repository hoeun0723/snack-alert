"use client";

import { useId } from "react";

import { kstTimeLabel } from "@/lib/kst";
import { MAX_COMMENT_LENGTH, type DayComment } from "@/lib/types";

export interface CommentBoardProps {
  /** 오늘 남긴 댓글 (작성 순서) */
  comments: DayComment[];
  /** 입력 중인 한 줄 */
  draft: string;
  onDraftChange: (value: string) => void;
  /** 댓글 남기기 — 폼 전송 */
  onSubmit: () => void;
  /** 저장 중이면 버튼·입력을 잠급니다 */
  busy: boolean;
  /** 이 브라우저에서 남긴 댓글 id (지우기 버튼을 이 댓글에만 보여 줍니다) */
  myCommentIds: string[];
  onDelete: (id: string) => void;
}

/** 익명이라도 목록이 밋밋하지 않도록, 댓글 id 로 늘 같은 얼굴을 골라 줍니다. */
const FACES = ["🍪", "🧸", "🍫", "🥨", "🍩", "🧁", "🥐", "🍬"];

function faceFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 10_000;
  }
  return FACES[hash % FACES.length] ?? FACES[0]!;
}

/**
 * 그날그날 익명 한 줄 댓글.
 * - 팀원 누구나 이름 없이 한 줄을 남기고 볼 수 있습니다.
 * - 남긴 시각은 KST 기준 오후 3:24 형태로 보여 줍니다.
 * - 자정이 지나 날짜가 바뀌면 새 날은 빈 목록으로 시작합니다. (댓글은 그날 기록에 남습니다)
 * - 이 화면에서 댓글을 남기거나 지워도 Teams 알림은 가지 않습니다.
 */
export default function CommentBoard({
  comments,
  draft,
  onDraftChange,
  onSubmit,
  busy,
  myCommentIds,
  onDelete,
}: CommentBoardProps) {
  const inputId = useId();
  const count = comments.length;
  const canSubmit = draft.trim().length > 0 && !busy;
  const mine = new Set(myCommentIds);

  return (
    <section className="comments" aria-labelledby={`${inputId}-title`}>
      <div className="comments__head">
        <h2 className="comments__title" id={`${inputId}-title`}>
          💬 오늘의 한 줄
        </h2>
        <span className="comments__total">
          {count > 0 ? `익명 댓글 ${count}개` : "이름 없이 한 줄 남겨보세요"}
        </span>
      </div>

      <form
        className="comments__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit();
        }}
      >
        <label className="visually-hidden" htmlFor={inputId}>
          익명 한 줄 댓글
        </label>
        <input
          id={inputId}
          className="comments__input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="오늘 간식 어땠어요? (익명)"
          enterKeyHint="send"
          autoComplete="off"
        />
        <button type="submit" className="comments__submit" disabled={!canSubmit}>
          {busy ? "남기는 중…" : "남기기"}
        </button>
      </form>

      {count > 0 ? (
        <ul className="comments__list">
          {comments.map((comment) => (
            <li key={comment.id} className="comments__item">
              <span className="comments__face" aria-hidden="true">
                {faceFor(comment.id)}
              </span>
              <div className="comments__body">
                <p className="comments__text">{comment.text}</p>
                <span className="comments__time">{kstTimeLabel(comment.createdAt)}</span>
              </div>
              {mine.has(comment.id) ? (
                <button
                  type="button"
                  className="comments__delete"
                  onClick={() => onDelete(comment.id)}
                  disabled={busy}
                  aria-label="내 댓글 지우기"
                  title="내 댓글 지우기"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="comments__empty">
          아직 댓글이 없어요. 오늘 간식에 대한 한마디를 남겨 주세요. (이름은 보이지 않아요)
        </p>
      )}
    </section>
  );
}
