const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD 文字列を UTC 日付として解釈する。不正な形式は例外を投げる */
export function parseDateString(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) {
    throw new RangeError(`日付はYYYY-MM-DD形式で指定してください: ${dateStr}`);
  }
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(ms)) {
    throw new RangeError(`不正な日付です: ${dateStr}`);
  }
  return new Date(ms);
}

/** Date（UTC基準）を YYYY-MM-DD 文字列にする */
export function toDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 起点日に経過日数を加えた日付（YYYY-MM-DD）を返す */
export function addDays(dateStr: string, days: number): string {
  const date = parseDateString(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

/** from から to までの経過日数（to - from） */
export function diffDays(from: string, to: string): number {
  const ms = parseDateString(to).getTime() - parseDateString(from).getTime();
  return Math.round(ms / MS_PER_DAY);
}

/** 現地時間の今日を YYYY-MM-DD で返す */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 日付（Date または YYYY-MM-DD 文字列）を UTC 正午基準ミリ秒に正規化する */
export function toDayMs(value: Date | string, label: string): number {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new RangeError(`${label}が不正な日付です`);
    }
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    throw new RangeError(`${label}はYYYY-MM-DD形式で指定してください: ${value}`);
  }
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(ms)) {
    throw new RangeError(`${label}が不正な日付です: ${value}`);
  }
  return ms;
}
