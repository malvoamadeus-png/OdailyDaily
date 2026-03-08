export type ShiftCode =
  | "weekday_morning"
  | "weekday_noon"
  | "weekday_night"
  | "weekend_morning"
  | "weekend_evening";

export type ShiftCalendarRow = {
  work_date: string; // YYYY-MM-DD
  shift_code: ShiftCode;
  operator: string;
  start_time: string; // HH:mm
  end_time: string; // HH:mm or 24:00
  timezone?: string | null;
};

export type ShiftAssignment =
  | {
      kind: "matched";
      shiftCode: ShiftCode;
      shiftKey: string; // work_date|shift_code
      workDate: string;
      operator: string;
    }
  | {
      kind: "other";
      shiftCode: "other";
      shiftKey: "other";
      workDate: "";
      operator: string;
    };

const BEIJING_TZ = "Asia/Shanghai";
const HALF_HOUR_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const SHIFT_LABELS: Record<ShiftCode | "other", string> = {
  weekday_morning: "工作日早班",
  weekday_noon: "工作日午班",
  weekday_night: "工作日晚班",
  weekend_morning: "周末早班",
  weekend_evening: "周末晚班",
  other: "其他",
};

export const OPERATOR_OPTIONS = ["shark", "Suzz", "CryptoLeo", "蔡聪", "南枳"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseHm(value: string): { h: number; m: number } {
  const [hRaw, mRaw] = (value || "").split(":");
  const h = Number(hRaw || 0);
  const m = Number(mRaw || 0);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [yRaw, mRaw, dRaw] = ymd.split("-");
  return {
    y: Number(yRaw || 0),
    m: Number(mRaw || 1),
    d: Number(dRaw || 1),
  };
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function toUtcFromBeijingDateTime(
  y: number,
  m: number,
  d: number,
  h: number,
  minute: number,
): Date {
  // 北京时区固定 UTC+8，无夏令时。
  return new Date(Date.UTC(y, m - 1, d, h - 8, minute, 0, 0));
}

export function beijingDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const y = map.get("year") ?? "1970";
  const m = map.get("month") ?? "01";
  const d = map.get("day") ?? "01";
  return `${y}-${m}-${d}`;
}

export function toDateInputValue(d: Date): string {
  return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function weekdayLabelFromDateKey(workDate: string): string {
  const { y, m, d } = parseYmd(workDate);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[weekday] ?? "";
}

export function getNaturalWeekRange(baseDate: string): { start: Date; end: Date } {
  const { y, m, d } = parseYmd(baseDate);
  const base = new Date(Date.UTC(y, m - 1, d));
  const weekday = base.getUTCDay(); // 0 Sun .. 6 Sat
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekStart = new Date(base.getTime() + mondayOffset * ONE_DAY_MS);
  const weekEnd = new Date(weekStart.getTime() + 6 * ONE_DAY_MS + (ONE_DAY_MS - 1));
  return { start: weekStart, end: weekEnd };
}

export function getNaturalMonthRange(baseDate: string): { start: Date; end: Date } {
  const { y, m } = parseYmd(baseDate);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const nextMonth = m === 12 ? new Date(Date.UTC(y + 1, 0, 1)) : new Date(Date.UTC(y, m, 1));
  const end = new Date(nextMonth.getTime() - 1);
  return { start, end };
}

export function shiftCodesForDate(workDate: string): ShiftCode[] {
  const { y, m, d } = parseYmd(workDate);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  return isWeekend
    ? ["weekend_morning", "weekend_evening"]
    : ["weekday_morning", "weekday_noon", "weekday_night"];
}

export function defaultShiftTimes(code: ShiftCode): { start_time: string; end_time: string } {
  if (code === "weekday_morning") return { start_time: "08:00", end_time: "13:30" };
  if (code === "weekday_noon") return { start_time: "13:30", end_time: "19:30" };
  if (code === "weekday_night") return { start_time: "19:30", end_time: "01:00" };
  if (code === "weekend_morning") return { start_time: "08:00", end_time: "16:00" };
  return { start_time: "16:00", end_time: "24:00" };
}

function buildShiftWindowMs(row: ShiftCalendarRow): { startMs: number; endMs: number; centerMs: number } {
  const { y, m, d } = parseYmd(row.work_date);
  const start = parseHm(row.start_time);
  const end = parseHm(row.end_time);
  const startUtc = toUtcFromBeijingDateTime(y, m, d, start.h, start.m).getTime();
  let endUtc = toUtcFromBeijingDateTime(y, m, d, end.h, end.m).getTime();

  // 24:00 或晚班跨天
  const is24 = row.end_time === "24:00";
  if (is24 || endUtc <= startUtc) endUtc += ONE_DAY_MS;

  return {
    startMs: startUtc - HALF_HOUR_MS,
    endMs: endUtc + HALF_HOUR_MS,
    centerMs: (startUtc + endUtc) / 2,
  };
}

export function assignShift(
  publishedAtIso: string,
  operator: string | null | undefined,
  calendarRows: ShiftCalendarRow[],
): ShiftAssignment {
  const op = (operator ?? "").trim();
  if (!op) return { kind: "other", shiftCode: "other", shiftKey: "other", workDate: "", operator: "" };

  const t = new Date(publishedAtIso).getTime();
  if (!Number.isFinite(t)) {
    return { kind: "other", shiftCode: "other", shiftKey: "other", workDate: "", operator: op };
  }

  const candidates: Array<{ row: ShiftCalendarRow; dist: number }> = [];
  for (const row of calendarRows) {
    if ((row.operator || "").trim() !== op) continue;
    const w = buildShiftWindowMs(row);
    if (t >= w.startMs && t <= w.endMs) {
      candidates.push({ row, dist: Math.abs(t - w.centerMs) });
    }
  }

  if (candidates.length === 0) {
    return { kind: "other", shiftCode: "other", shiftKey: "other", workDate: "", operator: op };
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const hit = candidates[0].row;
  return {
    kind: "matched",
    shiftCode: hit.shift_code,
    shiftKey: `${hit.work_date}|${hit.shift_code}`,
    workDate: hit.work_date,
    operator: op,
  };
}
