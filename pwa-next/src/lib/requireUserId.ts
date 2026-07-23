import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 每支雲端同步 API route 共用：拿目前登入的 Clerk userId，
// 沒登入就回傳一個現成的 401 NextResponse（呼叫端直接 return 它）。
export const requireUserId = async (): Promise<
  { userId: string; unauthorized?: undefined } | { userId?: undefined; unauthorized: NextResponse }
> => {
  const { userId } = await auth();
  if (!userId) {
    return { unauthorized: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { userId };
};
