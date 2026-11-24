/**
 * 익명 댓글에 붙는 얼굴 이모지.
 * 같은 댓글 id 는 언제 봐도 같은 얼굴이 되도록 id 로 골라 씁니다.
 */
export const COMMENT_FACES = ["🍪", "🧸", "🍫", "🥨", "🍩", "🧁", "🥐", "🍬"] as const;

export function faceFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 10_000;
  }
  return COMMENT_FACES[hash % COMMENT_FACES.length] ?? COMMENT_FACES[0];
}
