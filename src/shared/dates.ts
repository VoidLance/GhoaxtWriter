export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY/MM/DD", "YYYY/DD/MM"] as const;
export type DateFormat = typeof DATE_FORMATS[number];
export const DEFAULT_DATE_FORMAT: DateFormat = "DD/MM/YYYY";

export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === "string" && DATE_FORMATS.some((format) => format === value);
}

export function localDateKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(value: string, format: DateFormat): string | null {
  const parts = value.split("/");
  const tokens = format.split("/");
  if (parts.length !== 3 || parts.some((part, index) => !new RegExp(`^\\d{${tokens[index].length}}$`).test(part))) return null;
  const year = Number(parts[tokens.indexOf("YYYY")]);
  const month = Number(parts[tokens.indexOf("MM")]);
  const day = Number(parts[tokens.indexOf("DD")]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDate(date: string, format: DateFormat): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const parts = { YYYY: match[1], MM: match[2], DD: match[3] };
  return format.split("/").map((token) => parts[token as keyof typeof parts]).join("/");
}
