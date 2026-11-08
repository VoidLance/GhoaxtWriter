import { useState } from "react";
import { Modal } from "./Dialogs";
import { addDays, averagePace, dailyTarget, type Goals, todayKey } from "./goals";
import { formatDate, parseDate, type DateFormat } from "../shared/dates";

type Props = {
  goals: Goals;
  totalWords: number;
  todayWords: number;
  wordsAtStartOfToday: number;
  history: Record<string, number>;
  dateFormat: DateFormat;
  entries: Array<{ path: string; name: string; words: number; depth: number; type: "file" | "dir" }>;
  onSave: (goals: Goals) => void;
  onClose: () => void;
};

const field = "px-2 py-1 rounded-md border border-slate-700 bg-transparent";
const NOVEL_LENGTH = 80000;

export function GoalsDialog({ goals, totalWords, todayWords, wordsAtStartOfToday, history, dateFormat, entries, onSave, onClose }: Props) {
  const today = todayKey();
  const [target, setTarget] = useState(goals.overall?.target ? String(goals.overall.target) : "");
  const [start, setStart] = useState(formatDate(goals.overall?.start ?? today, dateFormat));
  const [end, setEnd] = useState(goals.overall?.end ? formatDate(goals.overall.end, dateFormat) : "");
  const [daily, setDaily] = useState(goals.daily ? String(goals.daily) : "");
  const [chapterGoals, setChapterGoals] = useState<Record<string, string>>(Object.fromEntries(Object.entries(goals.chapters ?? {}).map(([path, words]) => [path, String(words)])));

  const parsedStart = start.trim() ? parseDate(start.trim(), dateFormat) : today;
  const parsedEnd = end.trim() ? parseDate(end.trim(), dateFormat) : "";
  const invalidDate = parsedStart === null || parsedEnd === null;
  const draft: Goals = {
    overall: Number(target) > 0 && !invalidDate ? { target: Number(target), start: parsedStart, end: parsedEnd } : null,
    daily: Number(daily) > 0 ? Number(daily) : null,
    chapters: Object.fromEntries(Object.entries(chapterGoals).filter(([, value]) => Number(value) > 0).map(([path, value]) => [path, Number(value)])),
  };
  const plan = dailyTarget(draft, wordsAtStartOfToday, today);
  const pace = averagePace(history, totalWords, today);
  const perDay = plan.words ?? 0;
  const remainingToday = plan.words === null ? null : Math.max(0, plan.words - todayWords);

  let finish = "";
  if (draft.overall && totalWords < draft.overall.target) {
    const rate = perDay || pace || 0;
    if (rate > 0) finish = addDays(today, Math.ceil((draft.overall.target - totalWords) / rate));
  }

  return (
    <Modal onClose={onClose} width={620}>
      <strong style={{ fontSize: 18 }}>Word goals</strong>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {totalWords.toLocaleString()} words in total · {todayWords.toLocaleString()} written today
      </div>

      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginTop: 8 }}>Whole novel</div>
      <div className="flex gap-3 flex-wrap items-center">
        <label className="flex items-center gap-2">Target <input type="number" className={field} style={{ width: 110 }} min={0} value={target} onChange={(event) => setTarget(event.target.value)} /></label>
        <label className="flex items-center gap-2">From <input type="text" inputMode="numeric" placeholder={dateFormat} aria-invalid={parsedStart === null} className={field} style={{ width: 125 }} value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label className="flex items-center gap-2">To <input type="text" inputMode="numeric" placeholder={dateFormat} aria-invalid={parsedEnd === null} className={field} style={{ width: 125 }} value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      </div>
      <div role={invalidDate ? "alert" : undefined} style={{ fontSize: 12, color: invalidDate ? "#fca5a5" : "var(--muted)" }}>
        {invalidDate ? `Enter valid dates in ${dateFormat} format.` : `Enter dates in ${dateFormat} format.`}
      </div>

      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginTop: 8 }}>Daily</div>
      <label className="flex items-center gap-2">
        Words per day <input type="number" className={field} style={{ width: 110 }} min={0} placeholder={plan.auto ? String(plan.words) : ""} value={daily} onChange={(event) => setDaily(event.target.value)} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{daily ? "" : "leave empty to work it out from the novel goal"}</span>
      </label>

      <div className="rounded-lg border border-slate-700 p-3" style={{ fontSize: 13, lineHeight: 1.6 }}>
        {plan.words === null && <div>Set a whole-novel target with an end date, or a daily goal, to see your plan.</div>}
        {plan.auto && draft.overall && <div>To finish by {formatDate(draft.overall.end, dateFormat)}: <strong>{plan.words?.toLocaleString()} words a day</strong> ({plan.daysLeft} days left).</div>}
        {plan.auto && draft.overall && <div>{Math.max(0, draft.overall.target - totalWords).toLocaleString()} words left in the novel · {remainingToday?.toLocaleString()} left towards today's goal.</div>}
        {plan.words !== null && !plan.auto && (
          <div>
            At {plan.words.toLocaleString()} words a day you would write about <strong>{(plan.words * 365).toLocaleString()} words in a year</strong>, roughly {((plan.words * 365) / NOVEL_LENGTH).toFixed(1)} novels of {NOVEL_LENGTH.toLocaleString()} words.
          </div>
        )}
        {pace !== null && <div style={{ color: "var(--muted)" }}>Your average so far: {Math.round(pace).toLocaleString()} words a day.</div>}
        {finish && <div>{draft.overall?.target.toLocaleString()} words reached around <strong>{formatDate(finish, dateFormat)}</strong>{perDay ? " at the daily goal" : " at your average pace"}.</div>}
      </div>

      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginTop: 8 }}>Acts, chapters and scenes</div>
      {entries.length === 0 && <div style={{ color: "var(--muted)" }}>No acts, chapters or scenes yet.</div>}
      <div style={{ maxHeight: 220, overflow: "auto" }}>
        {entries.map((entry) => (
          <div key={entry.path} className="flex items-center justify-between gap-3 py-1" style={{ paddingLeft: entry.depth * 16 }}>
            <span>{entry.type === "file" ? "📄" : "📁"} {entry.name}</span>
            <span className="flex items-center gap-2">
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{entry.words.toLocaleString()} /</span>
              <input type="number" aria-label={`Word goal for ${entry.path}`} className={field} style={{ width: 100 }} min={0} placeholder="no goal" value={chapterGoals[entry.path] ?? ""} onChange={(event) => setChapterGoals({ ...chapterGoals, [entry.path]: event.target.value })} />
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" className="px-3 py-2 rounded-lg border border-slate-700" onClick={onClose}>Cancel</button>
        <button type="button" className="px-3 py-2 rounded-lg bg-amber-500 text-slate-900" disabled={invalidDate} onClick={() => onSave(draft)}>Save</button>
      </div>
    </Modal>
  );
}
