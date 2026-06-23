"use client";

import { useMemo } from "react";
import { formatTime } from "@/lib/format";

const NEON_COLORS = [
  "#FF2D94", // pink
  "#00B7FF", // blue
  "#39FF72", // green
  "#FF6A3D", // orange
  "#F4F4F7", // white
  "#B44FFF", // purple
  "#FFD700", // gold
  "#FF4444", // red
];

type RunnerStream = {
  name: string;
  actualTimeSecs: number;
  distData: number[];
  timeData: number[];
};

type Props = {
  runners: RunnerStream[];
  distanceKm: number;
};

/** Interpolate elapsed time at a given distance point */
function timeAt(dist: number[], time: number[], targetDist: number): number | null {
  if (dist.length === 0) return null;
  if (targetDist <= dist[0]) return time[0];
  for (let i = 1; i < dist.length; i++) {
    if (dist[i] >= targetDist) {
      const frac = (targetDist - dist[i - 1]) / (dist[i] - dist[i - 1]);
      return time[i - 1] + frac * (time[i] - time[i - 1]);
    }
  }
  return null; // not yet reached
}

export default function RaceReplay({ runners, distanceKm }: Props) {
  const totalMeters = distanceKm * 1000;
  const CHECKPOINTS = 80;
  const W = 340; // SVG viewBox width
  const H = 200; // SVG viewBox height
  const PAD = { top: 12, right: 60, bottom: 28, left: 28 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = runners.length;

  // Compute position at each checkpoint for each runner
  const positions = useMemo(() => {
    const checkpoints = Array.from({ length: CHECKPOINTS + 1 }, (_, i) =>
      (i / CHECKPOINTS) * totalMeters
    );

    return checkpoints.map((d) => {
      const times = runners.map((r) => ({
        name: r.name,
        t: timeAt(r.distData, r.timeData, d),
      }));

      // Sort those who have reached this point by elapsed time
      const reached = times.filter((x) => x.t !== null).sort((a, b) => a.t! - b.t!);
      const posMap = new Map<string, number>();
      reached.forEach((x, i) => posMap.set(x.name, i + 1));
      return posMap;
    });
  }, [runners, totalMeters]);

  // Build SVG path for each runner
  const paths = useMemo(() => {
    return runners.map((r) => {
      const points: string[] = [];
      for (let i = 0; i <= CHECKPOINTS; i++) {
        const pos = positions[i].get(r.name);
        if (pos == null) continue;
        const x = PAD.left + (i / CHECKPOINTS) * chartW;
        const y = PAD.top + ((pos - 1) / (n - 1 || 1)) * chartH;
        points.push(`${x},${y}`);
      }
      return points;
    });
  }, [positions, runners, chartW, chartH, n]);

  // X axis km labels
  const kmLabels = Array.from({ length: Math.floor(distanceKm) + 1 }, (_, i) => i);

  // Final positions (at last checkpoint)
  const finalPositions = useMemo(() => {
    const last = positions[positions.length - 1];
    return runners
      .map((r) => ({ ...r, pos: last.get(r.name) ?? n }))
      .sort((a, b) => a.pos - b.pos);
  }, [positions, runners, n]);

  // Detect overtakes (for annotation)
  const overtakes = useMemo(() => {
    const events: { name: string; atKm: number; color: string }[] = [];
    runners.forEach((r, ri) => {
      let prevPos: number | null = null;
      for (let i = 1; i <= CHECKPOINTS; i++) {
        const pos = positions[i].get(r.name);
        if (pos == null) continue;
        if (prevPos !== null && pos < prevPos) {
          // Moved up — overtake
          const km = (i / CHECKPOINTS) * distanceKm;
          events.push({ name: r.name, atKm: Math.round(km * 10) / 10, color: NEON_COLORS[ri % NEON_COLORS.length] });
        }
        prevPos = pos;
      }
    });
    return events.slice(0, 3); // max 3 annotations
  }, [positions, runners, distanceKm]);

  if (runners.length < 2) return null;

  return (
    <div className="bg-[#0B0D12] rounded-2xl border border-[#242a37] overflow-hidden card-depth">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#242a37] relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-16 bg-[#FF2D94]/10 rounded-full blur-2xl pointer-events-none" />
        <p className="text-[10px] font-black text-[#FF2D94] neon-pink uppercase tracking-widest mb-0.5">Race Replay</p>
        <p className="text-white/60 text-xs">Position over distance · who led when</p>
      </div>

      {/* SVG chart */}
      <div className="px-2 py-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ overflow: "visible" }}
        >
          {/* Background grid */}
          {kmLabels.map((km) => {
            const x = PAD.left + (km / distanceKm) * chartW;
            return (
              <line key={km} x1={x} y1={PAD.top} x2={x} y2={PAD.top + chartH}
                stroke="#242a37" strokeWidth="0.5" strokeDasharray="2,3" />
            );
          })}

          {/* Position grid lines */}
          {Array.from({ length: n }, (_, i) => {
            const y = PAD.top + (i / (n - 1 || 1)) * chartH;
            return (
              <line key={i} x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke="#242a37" strokeWidth="0.5" />
            );
          })}

          {/* Runner paths */}
          {runners.map((r, ri) => {
            const color = NEON_COLORS[ri % NEON_COLORS.length];
            const pts = paths[ri];
            if (pts.length < 2) return null;
            return (
              <g key={r.name}>
                {/* Glow layer */}
                <polyline
                  points={pts.join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth="4"
                  strokeOpacity="0.15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Main line */}
                <polyline
                  points={pts.join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.8"
                  strokeOpacity="0.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Finish dot */}
                {pts[pts.length - 1] && (() => {
                  const [fx, fy] = pts[pts.length - 1].split(",").map(Number);
                  return (
                    <circle cx={fx} cy={fy} r="3" fill={color}
                      style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                  );
                })()}
              </g>
            );
          })}

          {/* Y axis labels (1st, 2nd...) */}
          {Array.from({ length: Math.min(n, 4) }, (_, i) => {
            const y = PAD.top + (i / (n - 1 || 1)) * chartH;
            const label = i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`;
            return (
              <text key={i} x={PAD.left - 4} y={y + 3.5}
                fontSize="7" fill="#8A93A6" textAnchor="end"
                fontFamily="ui-sans-serif, system-ui, sans-serif">
                {label}
              </text>
            );
          })}

          {/* X axis km labels */}
          {kmLabels.map((km) => {
            const x = PAD.left + (km / distanceKm) * chartW;
            return (
              <text key={km} x={x} y={PAD.top + chartH + 10}
                fontSize="7" fill="#8A93A6" textAnchor="middle"
                fontFamily="ui-sans-serif, system-ui, sans-serif">
                {km}km
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend — final order */}
      <div className="px-4 pb-4 space-y-1.5">
        {finalPositions.map((r, i) => {
          const color = NEON_COLORS[runners.findIndex((x) => x.name === r.name) % NEON_COLORS.length];
          const trophy = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          return (
            <div key={r.name} className="flex items-center gap-2">
              <div style={{ width: 24, height: 2, background: color, borderRadius: 1, boxShadow: `0 0 6px ${color}` }} />
              <span style={{ color }} className="text-xs font-black tabnum">{trophy}</span>
              <span className="text-xs text-[#F4F4F7] font-semibold flex-1">{r.name}</span>
              <span className="text-xs font-black tabnum" style={{ color }}>{formatTime(r.actualTimeSecs)}</span>
            </div>
          );
        })}
      </div>

      {/* Overtake callouts */}
      {overtakes.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {overtakes.map((o, i) => (
            <span key={i} className="text-[10px] font-bold px-2 py-1 rounded-full border"
              style={{ color: o.color, borderColor: `${o.color}40`, background: `${o.color}10` }}>
              {o.name} moved up @ {o.atKm}km
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
