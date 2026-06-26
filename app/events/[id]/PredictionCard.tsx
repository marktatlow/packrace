"use client";
import { formatTime, formatBST } from "@/lib/format";

type Props = {
  joined: boolean;
  predictedTimeSecs: number | null;
  windowStarted: boolean;
  windowStart: Date;
  saving: boolean;
  predictInput: React.RefObject<HTMLInputElement | null>;
  onSave: () => void;
};

export default function PredictionCard({ joined, predictedTimeSecs, windowStarted, windowStart, saving, predictInput, onSave }: Props) {
  if (!joined) return null;

  return (
    <section>
      <p className="text-[10px] font-black text-white/65 uppercase tracking-widest mb-2">Your Prediction</p>
      <div className={`bg-[#12151D] rounded-2xl shadow-sm overflow-hidden border ${!windowStarted ? "border-[#FF2D94]" : "border-white/10"}`}>
        {!windowStarted && <div className="h-1 bg-[#FF2D94]" />}
        {windowStarted && <div className="h-1 bg-[#39FF72]" />}
        <div className="p-4">
          {predictedTimeSecs ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-black text-[#F4F4F7] tabular-nums">{formatTime(predictedTimeSecs)}</p>
              </div>
              {!windowStarted && (
                <button onClick={() => predictInput.current?.focus()}
                  className="text-xs text-[#FF2D94] border border-[#FF2D94] px-3 py-1.5 rounded-lg font-semibold">
                  Edit
                </button>
              )}
              {windowStarted && (
                <span className="text-xs text-[#FF6A3D] font-black bg-[#FF6A3D]/10 px-3 py-1.5 rounded-lg">🔒 Locked</span>
              )}
            </div>
          ) : (
            <p className="text-white/65 text-sm">No prediction yet — enter one below</p>
          )}
          {!windowStarted && (
            <div className="mt-3 flex gap-2">
              <input ref={predictInput} placeholder="mm:ss or h:mm:ss"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[#F4F4F7] text-sm focus:outline-none focus:border-[#FF2D94]" />
              <button onClick={onSave} disabled={saving}
                className="bg-[#FF2D94] text-white text-sm font-black px-4 py-2 rounded-xl disabled:opacity-50 shadow-sm">
                {saving ? "…" : "Save"}
              </button>
            </div>
          )}
          {!windowStarted && (
            <p className="text-xs text-white/65 mt-2 text-center">
              Locks when window opens · {formatBST(windowStart)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
