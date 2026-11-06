import { NextRequest, NextResponse } from "next/server";

const ASSET_ORIGIN = "http://47.107.120.126:8080";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.toLowerCase() ?? "";
  if (!/^[a-z]{2}$/.test(code)) {
    return NextResponse.json({ error: "无效的图片编号" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${ASSET_ORIGIN}/dev-api/profile/DownloadImg/flags/4x3/${code}.svg`, {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 },
    });
    if (!upstream.ok || !upstream.headers.get("content-type")?.includes("image/svg+xml")) {
      return new Response(null, { status: 404 });
    }
    const image = await upstream.arrayBuffer();
    if (image.byteLength > 20_000) return new Response(null, { status: 502 });
    return new Response(image, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
