const BST = "Europe/London";

/** Format a Date as "23 Jun, 06:00 BST" */
export function formatBST(date: Date, opts: { includeDate?: boolean; includeTime?: boolean } = {}): string {
  const { includeDate = true, includeTime = true } = opts;
  const parts: string[] = [];
  if (includeDate) {
    parts.push(date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: BST }));
  }
  if (includeTime) {
    parts.push(date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: BST, timeZoneName: "short" }));
  }
  return parts.join(", ");
}

/** Format window: "23 Jun, 06:00 – 11:00 BST" or multi-day "23 Jun 06:00 – 24 Jun 11:00 BST" */
export function formatWindow(start: Date, end: Date): string {
  const startDay = start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: BST });
  const endDay   = end.toLocaleDateString("en-GB",   { day: "numeric", month: "short", timeZone: BST });
  const startTime = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: BST });
  const endTime   = end.toLocaleTimeString("en-GB",   { hour: "2-digit", minute: "2-digit", timeZone: BST });
  const tz = end.toLocaleTimeString("en-GB", { timeZoneName: "short", timeZone: BST }).split(" ").pop() ?? "BST";
  if (startDay === endDay) return `${startDay}, ${startTime} – ${endTime} ${tz}`;
  return `${startDay} ${startTime} – ${endDay} ${endTime} ${tz}`;
}

export function formatTime(secs: number): string {
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatPace(secsPerKm: number): string {
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatHandicap(secs: number): string {
  if (secs === 0) return "+0:00";
  const sign = secs >= 0 ? "+" : "-";
  return sign + formatTime(Math.abs(secs));
}

export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)} days ago`;
  if (hours >= 1) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes >= 1) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}
