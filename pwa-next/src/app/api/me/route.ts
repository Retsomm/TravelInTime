import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireUserId";

export const GET = async () => {
  const auth = await requireUserId();
  if (auth.unauthorized) return auth.unauthorized;
  return NextResponse.json({ userId: auth.userId });
};
