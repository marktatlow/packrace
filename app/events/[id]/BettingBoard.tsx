"use client";

import { useState } from "react";
import { Trophy, Crosshair, Drama, Flame, Zap, X, Plus, Share2, Lock } from "lucide-react";
import type { TipsterEntry } from "@/lib/racecard";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg: "#0B0D12",
  panel: "#12151D",
  panel2: "#171B25",
  line: "#242a37",
  text: "#F4F4F7",
  dim: "#8A93A6",
  pink: "#FF2D94",
  blue: "#00B7FF",
  green: "#39FF72",
  orange: "#FF6A3D",
};

// Trap colours cycling through brand palette
const TRAP_COLORS = [
  { bg: "#FF2D94", fg: "#fff" },
  { bg: "#00B7FF", fg: "#11141b" },
  { bg: "#39FF72", fg: "#11141b" },
  { bg: "#FF6A3D", fg: "#fff" },
  { bg: "#7B2FBE", fg: "#fff" },
  { bg: "#F4F4F7", fg: "#11141b" },
];

// ── Odds helpers ──────────────────────────────────────────────────────────────
/** Parse Tips odds string e.g. "4/1 against", "2/1 on", "Evens" → [num, den] */
function parseOdds(s: string | undefined): [number, number] {
  if (!s) return [1, 1];
  const low = s.toLowerCase().trim();
  if (low === "evens" || low === "evs" || low === "1/1") return [1, 1];
  const m = low.match(/(\d+)\/(\d+)/);
  if (!m) return [1, 1];
  const n = parseInt(m[1]), d = parseInt(m[2]);
  return low.includes(" on") ? [d, n] : [n, d]; // "on" inverts fraction
}

function decimalOdds([n, d]: [number, number]) { return 1 + n / d; }
function impliedPct([n, d]: [number, number]) { return Math.round((d / (n + d)) * 100); }
function fracStr([n, d]: [number, number]) {
  if (n === d) return "evs";
  return `${n}/${d}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Runner = {
  name: string;
  trap: number;
  o: [number, number];
  note: string;
};

type SlipItem = {
  mk: string;
  name: string;
  trap: number;
  o: [number, number];
  accent: string;
  marketLabel: string;
};

type Participant = {
  id: string;
  firstName: string;
  predictedTimeSecs: number | null;
  vdotPredictedSecs: number | null;
};

type Props = {
  eventName: string;
  distanceKm: number;
  windowStart: string;
  participants: Participant[];
  tips: TipsterEntry[];
  windowStarted: boolean;
  windowEnded: boolean;
};

function TrapBadge({ trap, size = 34 }: { trap: number; size?: number }) {
  const t = TRAP_COLORS[(trap - 1) % TRAP_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.24,
      background: t.bg, color: t.fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.48, flexShrink: 0,
      border: t.bg === "#F4F4F7" ? `1px solid ${C.line}` : "none",
    }}>
      {trap}
    </div>
  );
}

export default function BettingBoard({ eventName, distanceKm, windowStart, participants, tips, windowStarted, windowEnded }: Props) {
  const [market, setMarket] = useState<"fastest" | "beat" | "sandbag">("fastest");
  const [frac, setFrac] = useState(true);
  const [slip, setSlip] = useState<SlipItem[]>([]);

  const oddsLocked = windowStarted || windowEnded;

  // Build markets from real Tips data
  const buildMarket = () => {
    return participants
      .filter((p) => p.vdotPredictedSecs && p.predictedTimeSecs)
      .map((p, idx) => {
        const tip = tips.find((t) => t.name === p.firstName);
        const trap = (idx % 6) + 1;
        const sandbaggingGap = p.vdotPredictedSecs && p.predictedTimeSecs
          ? p.predictedTimeSecs - p.vdotPredictedSecs  // positive = sandbagging
          : 0;

        if (market === "fastest") {
          return {
            name: p.firstName, trap,
            o: parseOdds(tip?.fastestOdds),
            note: tip?.fastestOddsNote ?? "—",
          };
        }
        if (market === "beat") {
          return {
            name: p.firstName, trap,
            o: parseOdds(tip?.odds),
            note: tip?.oddsNote ?? "—",
          };
        }
        // sandbagger market — from AI-generated odds
        return {
          name: p.firstName, trap,
          o: parseOdds(tip?.sandbagOdds),
          note: tip?.sandbagOddsNote ?? "—",
        };
      })
      .sort((a, b) => decimalOdds(a.o) - decimalOdds(b.o));
  };

  const rows: Runner[] = buildMarket();

  const MARKETS = {
    fastest: { label: "Fastest Runner", sub: "To record the quickest actual time", icon: Trophy, accent: C.green },
    beat:    { label: "Beat the Estimate", sub: "Who will beat their own predicted time", icon: Crosshair, accent: C.blue },
    sandbag: { label: "Biggest Sandbagger", sub: "Novelty · biggest gap between prediction and form", icon: Drama, accent: C.orange },
  } as const;

  const m = MARKETS[market];

  const inSlip = (mk: string, name: string) => slip.some((s) => s.mk === mk && s.name === name);
  const toggle = (r: Runner) => {
    const key = { mk: market, name: r.name };
    setSlip((s) =>
      inSlip(market, r.name)
        ? s.filter((x) => !(x.mk === market && x.name === r.name))
        : [...s, { ...key, o: r.o, accent: m.accent, marketLabel: m.label, trap: r.trap }]
    );
  };

  const STAKE = 100;
  const totalReturn = slip.reduce((sum, s) => sum + STAKE * decimalOdds(s.o), 0);
  const profit = Math.round(totalReturn - slip.length * STAKE);
  const oddsLabel = (o: [number, number]) => frac ? fracStr(o) : decimalOdds(o).toFixed(2);

  const windowDate = new Date(windowStart).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London",
  });

  return (
    <div style={{ background: C.bg, borderRadius: 22, overflow: "hidden", border: `1px solid ${C.line}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>

      {/* Header */}
      <div style={{ padding: "18px 16px 14px", background: `radial-gradient(120% 80% at 50% -10%, rgba(255,45,148,.2), transparent 60%)`, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 900, fontSize: 20, color: C.text }}>Race</span>
            <span style={{ fontWeight: 900, fontSize: 20, color: C.pink, textShadow: `0 0 16px ${C.pink}` }}>Party</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.dim, letterSpacing: 2, marginLeft: 3, alignSelf: "flex-start", marginTop: 2 }}>ODDS</span>
          </div>
          {oddsLocked ? (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: C.dim, border: `1px solid ${C.line}`, padding: "4px 8px", borderRadius: 999 }}>
              <Lock size={10} /> LOCKED
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: C.green, border: `1px solid ${C.green}`, padding: "4px 8px", borderRadius: 999, textShadow: `0 0 8px ${C.green}` }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: C.green, boxShadow: `0 0 8px ${C.green}` }} /> BOARD OPEN
            </span>
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 17, fontWeight: 800, color: C.text }}>{eventName}</div>
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{windowDate} · {distanceKm}km · {participants.length} declared</div>
      </div>

      {/* Market tabs */}
      <div style={{ display: "flex", gap: 5, padding: "10px 10px 0" }}>
        {(Object.entries(MARKETS) as [typeof market, typeof MARKETS[typeof market]][]).map(([key, mk]) => {
          const active = key === market;
          const Icon = mk.icon;
          return (
            <button key={key} onClick={() => setMarket(key)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "8px 4px", borderRadius: 10, cursor: "pointer",
              background: active ? C.panel2 : "transparent",
              border: `1px solid ${active ? mk.accent : "transparent"}`,
              color: active ? mk.accent : C.dim, fontWeight: 700, fontSize: 10,
              textShadow: active ? `0 0 10px ${mk.accent}` : "none",
            }}>
              <Icon size={14} />
              <span style={{ textAlign: "center", lineHeight: 1.2 }}>{mk.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subtitle + odds format toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 4px" }}>
        <span style={{ fontSize: 11.5, color: C.dim, flex: 1, paddingRight: 8 }}>{m.sub}</span>
        <button onClick={() => setFrac((f) => !f)} style={{
          fontSize: 10, fontWeight: 800, color: C.text, background: C.panel2,
          border: `1px solid ${C.line}`, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
        }}>
          {frac ? "FRAC" : "DEC"}
        </button>
      </div>

      {/* Runner rows */}
      <div style={{ padding: "4px 10px 8px" }}>
        {rows.map((r, i) => {
          const fav = i === 0;
          const picked = inSlip(market, r.name);
          return (
            <button key={r.name} onClick={() => !oddsLocked && toggle(r)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
              background: picked ? C.panel2 : C.panel, cursor: oddsLocked ? "default" : "pointer",
              border: `1px solid ${picked ? m.accent : C.line}`, borderRadius: 12,
              padding: "9px 10px", marginBottom: 6,
            }}>
              <TrapBadge trap={r.trap} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>{r.name}</span>
                  {fav && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 900, color: C.bg, background: m.accent, padding: "1px 5px", borderRadius: 999 }}>
                      <Flame size={8} /> FAV
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: C.dim, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.note}
                </div>
              </div>
              <div style={{
                minWidth: 58, textAlign: "center", padding: "6px 7px", borderRadius: 8,
                background: "#05060a", border: `1px solid ${picked ? m.accent : C.line}`,
                fontWeight: 900, fontSize: 15, color: picked ? m.accent : C.text,
                textShadow: picked ? `0 0 10px ${m.accent}` : "none",
                fontFamily: "ui-monospace, monospace",
              }}>
                {oddsLabel(r.o)}
              </div>
              {!oddsLocked && (
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: picked ? m.accent : "transparent",
                  border: `1px solid ${picked ? m.accent : C.line}`,
                  color: picked ? C.bg : C.dim,
                }}>
                  {picked ? <X size={11} /> : <Plus size={11} />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Clout slip */}
      {slip.length > 0 && !oddsLocked && (
        <div style={{ margin: "2px 10px 0", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 800, fontSize: 12.5, color: C.text }}>
              <Zap size={13} color={C.pink} /> Clout Slip · {slip.length}
            </span>
            <button onClick={() => setSlip([])} style={{ fontSize: 11, color: C.dim, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
          </div>
          {slip.map((s) => (
            <div key={s.mk + s.name} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 12 }}>
              <TrapBadge trap={s.trap} size={18} />
              <span style={{ flex: 1, color: C.text, fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: C.dim, fontSize: 10 }}>{s.marketLabel}</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: s.accent }}>{oddsLabel(s.o)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.line}` }}>
            <div>
              <div style={{ fontSize: 10, color: C.dim }}>Clout each</div>
              <div style={{ fontSize: 12, color: C.text }}>{STAKE} × {slip.length}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.dim }}>Clout to win</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.green, textShadow: `0 0 12px ${C.green}`, fontVariantNumeric: "tabular-nums" }}>+{profit}</div>
            </div>
          </div>
        </div>
      )}

      {/* Share + disclaimer */}
      <div style={{ padding: "12px 12px 14px" }}>
        <button style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "11px 0", borderRadius: 11, border: "none", cursor: "pointer",
          fontWeight: 800, fontSize: 13.5, color: "#fff",
          background: `linear-gradient(90deg, ${C.pink}, ${C.orange})`,
          boxShadow: `0 5px 20px rgba(255,45,148,.35)`,
        }}>
          <Share2 size={15} /> Share the board
        </button>
        <div style={{ textAlign: "center", fontSize: 10, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
          🎉 Bragging rights only · Clout has no cash value · Not gambling
        </div>
      </div>
    </div>
  );
}
