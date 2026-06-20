import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL || ""}/`
  );
  response.cookies.set("packrace_session", "", { maxAge: 0, path: "/" });
  return response;
}
