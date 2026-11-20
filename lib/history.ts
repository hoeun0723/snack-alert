import { reactionTotal, type DayView, type PopularSnack } from "@/lib/types";

export interface HistoryResult {
  /** 기록이 있는 날만, 최신순 */
  history: DayView[];
  /** 반응이 가장 많은 간식 (반응이 하나도 없으면 null) */
  popular: PopularSnack | null;
}

/**
 * 읽어온 날짜들을 히스토리 화면에 쓰는 모양으로 정리합니다.
 *
 * - 기록이 있는 날(updatedAt 이 있는 날)만 남기고 최신순으로 정렬
 * - 같은 간식 이름(label)끼리 반응을 모아 1위를 뽑습니다. (동점이면 최근 날짜)
 */
export function buildHistory(days: DayView[]): HistoryResult {
  const history = days
    .filter((day) => Boolean(day.updatedAt))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const groups = new Map<string, PopularSnack>();
  for (const day of history) {
    const label = day.label.trim();
    if (!label) continue;
    const total = reactionTotal(day.reactions);
    const group = groups.get(label);
    if (group) {
      group.total += total;
      if (day.date > group.date) group.date = day.date;
    } else {
      groups.set(label, { label, total, date: day.date });
    }
  }

  let popular: PopularSnack | null = null;
  for (const group of groups.values()) {
    if (group.total <= 0) continue;
    if (
      !popular ||
      group.total > popular.total ||
      (group.total === popular.total && group.date > popular.date)
    ) {
      popular = group;
    }
  }

  return { history, popular };
}
