export type Goals = {
  overall?: { target: number; start: string; end: string } | null;
  daily?: number | null;
  chapters?: Record<string, number>;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000);
}

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

// An explicit daily goal wins; otherwise it is worked out from the overall target and deadline.
export function dailyTarget(goals: Goals, wordsAtStartOfToday: number, today: string) {
  if (goals.daily) return { words: goals.daily, auto: false, daysLeft: null as number | null };
  if (goals.overall?.end && goals.overall.target > 0) {
    const daysLeft = Math.max(1, daysBetween(today, goals.overall.end) + 1);
    return { words: Math.ceil(Math.max(0, goals.overall.target - wordsAtStartOfToday) / daysLeft), auto: true, daysLeft };
  }
  return { words: null as number | null, auto: false, daysLeft: null as number | null };
}

// History maps a date to the novel's total at the start of that day.
export function averagePace(history: Record<string, number>, totalWords: number, today: string) {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return null;
  const days = daysBetween(dates[0], today) + 1;
  return days >= 2 ? Math.max(0, (totalWords - history[dates[0]]) / days) : null;
}
