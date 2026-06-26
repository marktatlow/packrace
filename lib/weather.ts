// Weather conditions per athlete location, derived from their most recent
// GPS-tagged run (falls back to self-reported Strava profile city).
// Uses Open-Meteo — free, no API key required.

const STRAVA_API = "https://www.strava.com/api/v3";

export type AthleteLocation = {
  lat: number;
  lon: number;
  city: string;
  source: "gps" | "profile";
};

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`, {
    headers: { "User-Agent": "PackRace/1.0" },
  });
  const data = await res.json();
  const a = data.address ?? {};
  return a.city ?? a.town ?? a.village ?? a.county ?? "Unknown";
}

async function forwardGeocode(cityName: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`);
  const data = await res.json();
  const r = data?.results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude } : null;
}

/**
 * Resolve where an athlete is actually running from: prefer the GPS start
 * point of their most recent activity, fall back to their Strava profile city.
 */
export async function getAthleteLocation(
  accessToken: string,
  profileCity: string | null
): Promise<AthleteLocation | null> {
  try {
    const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=1&page=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const activities = await res.json();
    const latlng = Array.isArray(activities) ? activities[0]?.start_latlng : null;
    if (latlng && latlng.length === 2) {
      const city = await reverseGeocode(latlng[0], latlng[1]);
      return { lat: latlng[0], lon: latlng[1], city, source: "gps" };
    }
  } catch { /* fall through to profile city */ }

  if (profileCity) {
    const coords = await forwardGeocode(profileCity.trim());
    if (coords) return { ...coords, city: profileCity.trim(), source: "profile" };
  }
  return null;
}

export type ConditionsForecast = {
  city: string;
  tempC: number;
  humidityPct: number;
  windKph: number;
  precipPct: number;
  adjustmentPct: number; // rough, display-only heat/humidity estimate — NOT applied to predictions
  icon: string;          // emoji representing the dominant condition
};

// Priority order: rain beats everything (gear matters most), then heat, then
// cold, then wind; otherwise just a pleasant default.
function pickConditionIcon(tempC: number, windKph: number, precipPct: number): string {
  if (precipPct >= 50) return "☔";
  if (tempC >= 26) return "🥵";
  if (tempC <= 8) return "🥶";
  if (windKph >= 30) return "💨";
  return "🙂";
}

// Conservative, transparent heuristic: comfortable baseline ~12°C.
// Above that, endurance pace cost rises roughly with heat + humidity load.
// This is a rough display estimate only — not validated against real results,
// and must not be wired into VDOT predictions without backtesting first.
function estimateAdjustmentPct(tempC: number, humidityPct: number): number {
  const heatLoad = Math.max(0, tempC - 12);
  const humidityFactor = humidityPct > 60 ? (humidityPct - 60) / 100 : 0;
  const pct = heatLoad * 0.3 * (1 + humidityFactor);
  return Math.round(Math.min(pct, 8) * 10) / 10; // cap at +8%, 1 decimal
}

/**
 * Forecast for a given lat/lon AT THE EXACT RACE START TIME (not the day's
 * peak) — a daily max reads warm for an early-morning or evening race and
 * misleads runners about what it'll actually feel like on the start line.
 * Open-Meteo only forecasts ~16 days out — returns null if out of range.
 */
export async function getForecast(lat: number, lon: number, startTimeISO: string): Promise<ConditionsForecast | null> {
  const startMs = new Date(startTimeISO).getTime();
  const today = new Date().toISOString().slice(0, 10);
  const daysOut = Math.round((startMs - new Date(today).getTime()) / 86400000);
  if (daysOut < 0 || daysOut > 15) return null;

  // Request a day either side to safely cover any UTC/local date-boundary shift
  const startDate = new Date(startMs - 86400000).toISOString().slice(0, 10);
  const endDate = new Date(startMs + 86400000).toISOString().slice(0, 10);

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability` +
    `&timezone=auto&start_date=${startDate}&end_date=${endDate}`
  );
  const data = await res.json();
  const h = data?.hourly;
  if (!h?.time?.length) return null;

  // Find the hour closest to the actual local race start time
  const offsetMs = (data.utc_offset_seconds ?? 0) * 1000;
  const localStartMs = startMs + offsetMs;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < h.time.length; i++) {
    const slotLocalMs = new Date(h.time[i]).getTime(); // h.time is local wall-clock (timezone=auto)
    const diff = Math.abs(slotLocalMs - localStartMs);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }

  const tempC = h.temperature_2m?.[bestIdx];
  if (tempC == null) return null;
  const humidityPct = h.relative_humidity_2m?.[bestIdx] ?? 50;
  const windKph = h.wind_speed_10m?.[bestIdx] ?? 0;
  const precipPct = h.precipitation_probability?.[bestIdx] ?? 0;

  return {
    city: "",
    tempC,
    humidityPct,
    windKph,
    precipPct,
    adjustmentPct: estimateAdjustmentPct(tempC, humidityPct),
    icon: pickConditionIcon(tempC, windKph, precipPct),
  };
}
