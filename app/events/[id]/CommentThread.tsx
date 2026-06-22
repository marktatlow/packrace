"use client";

import { useState, useRef } from "react";
import { Send } from "lucide-react";

export type CommentData = {
  id: string;
  authorId: string;
  authorName: string;
  profilePic: string | null;
  body: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

type Props = {
  eventId: string;
  targetType: "runner" | "event";
  targetId: string;
  currentUserId: string;
  initialComments: CommentData[];
};

export default function CommentThread({
  eventId, targetType, targetId, currentUserId, initialComments,
}: Props) {
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function post() {
    if (!draft.trim() || posting) return;
    setPosting(true);

    // Optimistic
    const optimistic: CommentData = {
      id: `opt-${Date.now()}`,
      authorId: currentUserId,
      authorName: "You",
      profilePic: null,
      body: draft.trim(),
      createdAt: new Date().toISOString(),
    };
    setComments((c) => [...c, optimistic]);
    setDraft("");

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, targetType, targetId, body: draft.trim() }),
      });
      if (res.ok) {
        const saved = await res.json();
        setComments((c) => c.map((x) => x.id === optimistic.id ? saved : x));
      }
    } catch {
      setComments((c) => c.filter((x) => x.id !== optimistic.id));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 items-start">
              {c.profilePic
                ? <img src={c.profilePic} className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" alt="" />
                : <div className={`w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-black text-white ${c.authorId === currentUserId ? "bg-[#FF2D94]" : "bg-[#0D0F14]"}`}>
                    {c.authorName[0]}
                  </div>
              }
              <div className="flex-1 bg-[#1A1D26] rounded-xl px-3 py-2 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-[#F4F4F7]">{c.authorName}</span>
                  <span className="text-[10px] text-white/65">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-[#F4F4F7] mt-0.5 leading-snug break-words">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && post()}
          placeholder="Add a comment… 😄"
          maxLength={500}
          className="flex-1 text-sm text-[#F4F4F7] bg-[#1A1D26] border border-white/10 rounded-full px-4 py-2 focus:outline-none focus:border-[#FF2D94] placeholder-white/30"
        />
        <button
          onClick={post}
          disabled={!draft.trim() || posting}
          className="w-9 h-9 rounded-full bg-[#FF2D94] flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
        >
          <Send size={14} color="white" />
        </button>
      </div>
    </div>
  );
}
