/* AICI INCEPE CODUL - app/api/client-ip/route.ts */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  const ip =
    forwardedFor?.split(",")[0] ||
    "unknown";

  return NextResponse.json({
    ip,
  });
}

/* AICI SE TERMINA CODUL - app/api/client-ip/route.ts */