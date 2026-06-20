"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = params.inviteCode as string;

  useEffect(() => {
    router.replace(`/api/events/join/${inviteCode}`);
  }, [inviteCode, router]);

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
      <p className="text-white">Joining event...</p>
    </div>
  );
}
