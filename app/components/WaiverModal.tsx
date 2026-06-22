"use client";

import { useState } from "react";

type Props = {
  onAccept: () => void;
  onCancel: () => void;
};

export default function WaiverModal({ onAccept, onCancel }: Props) {
  const [ticked, setTicked] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4">
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-[#FF6B35] px-5 pt-6 pb-5 flex-shrink-0">
          <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-1">Before you join</p>
          <h2 className="text-white text-xl font-black leading-tight">RaceParty Participation Waiver</h2>
        </div>

        {/* Scrollable waiver text */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <p className="text-gray-700 text-sm leading-relaxed mb-4">
            By joining this RaceParty event, I agree that:
          </p>
          <ol className="space-y-3 text-sm text-gray-600 leading-relaxed list-none">
            {[
              "I am taking part voluntarily and at my own risk.",
              "RaceParty is a prediction, leaderboard and social results platform. It is not the organiser of a formal race, parkrun, club run, coached session, guided activity, or supervised sporting event.",
              "I am responsible for choosing my own route, location, timing, pace, effort level, equipment, clothing, hydration, road safety, personal safety, and whether I am fit enough to take part.",
              "I understand that running and physical activity involve risks, including injury, illness, accidents, traffic, falls, collisions, weather conditions, unsafe surfaces, and the actions of other people.",
              "I agree to follow all applicable laws, road rules, park rules, venue rules and local safety guidance.",
              "I will not take part if I am injured, unwell, medically advised not to exercise, or otherwise not fit to run.",
              "To the fullest extent permitted by law, I agree that RaceParty, its organisers, hosts, admins, creators and contributors are not responsible for any injury, loss, damage, cost or claim arising from my participation, except where liability cannot legally be excluded.",
              "I am responsible for the accuracy and visibility of any activity data I submit or connect through Strava or any other platform.",
              "I understand that results, rankings, commentary and race-card content are for fun and may include jokes, banter or automated summaries.",
              "I consent to my name, profile image, prediction, result and leaderboard position being shown to other participants in this event and in related share cards or group updates.",
            ].map((clause, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-[#FF6B35] font-black text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                <span>{clause}</span>
              </li>
            ))}
          </ol>
          <p className="text-gray-500 text-xs leading-relaxed mt-4 italic border-t border-gray-100 pt-4">
            By joining, predicting, submitting an activity, or appearing on the leaderboard, I confirm that I have read and accepted this waiver.
          </p>
        </div>

        {/* Checkbox + buttons */}
        <div className="flex-shrink-0 px-5 pb-6 pt-4 border-t border-gray-100 space-y-4 bg-white">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={ticked}
              onChange={(e) => setTicked(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-[#FF6B35] flex-shrink-0 cursor-pointer"
            />
            <span className="text-sm text-gray-700 font-semibold leading-snug">
              I have read and accept the RaceParty waiver. I understand I am taking part voluntarily and at my own risk.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 font-semibold text-sm">
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={!ticked}
              className="flex-1 py-3 rounded-2xl bg-[#FF6B35] text-white font-black text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              Join Race
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
