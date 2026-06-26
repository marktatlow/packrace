import { prisma } from "../lib/prisma";
import { refreshTokenIfNeeded } from "../lib/strava";

const STRAVA_API = "https://www.strava.com/api/v3";

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`, {
    headers: { "User-Agent": "PackRace-internal-check/1.0" },
  });
  const data = await res.json();
  const a = data.address ?? {};
  return a.city ?? a.town ?? a.village ?? a.county ?? data.display_name ?? "unknown";
}

async function main() {
  const names = ["Mark", "Laine", "vanil"];
  for (const name of names) {
    const user = await prisma.user.findFirst({ where: { firstName: name } });
    if (!user) continue;
    console.log(`\n== ${user.firstName} (profile city: ${user.city}, ${user.country}) ==`);
    const accessToken = await refreshTokenIfNeeded(user.id);
    const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=3&page=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const activities = await res.json();
    if (!Array.isArray(activities)) { console.log("  error:", activities); continue; }
    for (const act of activities) {
      const latlng = act.start_latlng;
      if (!latlng || latlng.length < 2) {
        console.log(`  ${act.name} (${new Date(act.start_date).toLocaleDateString()}): no GPS start point`);
        continue;
      }
      const place = await reverseGeocode(latlng[0], latlng[1]);
      console.log(`  ${act.name} (${new Date(act.start_date).toLocaleDateString()}): ${place}`);
      await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim 1req/s
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
