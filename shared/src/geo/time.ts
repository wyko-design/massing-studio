/** Offset of a time zone from UTC at an instant, in minutes (Amsterdam summer = +120). */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((wall - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/**
 * Wall-clock date ("2026-09-21") and time ("09:30") in a time zone → ISO string with the zone's
 * offset at that moment ("2026-09-21T09:30:00+02:00"), so the sun never depends on the machine's zone.
 */
export function zonedIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // the offset at the guessed instant, then again at the corrected one (DST changes in between)
  let offset = zoneOffsetMinutes(wallAsUtc, timeZone);
  offset = zoneOffsetMinutes(wallAsUtc - offset * 60000, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${pad(h!)}:${pad(mi!)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Date and wall-clock time parts of an ISO string written by `zonedIso`. */
export const isoParts = (iso: string) => ({ date: iso.slice(0, 10), time: iso.slice(11, 16) });
