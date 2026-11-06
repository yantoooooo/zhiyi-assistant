import { request as httpsRequest } from "node:https";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_API_BASE = "https://test-2026.cyberantt.com/dev-api";
const PROFILE_PATH = "/dev-api/zy/baseInfo/profile";

type ProfileResponse = {
  code?: unknown;
  data?: { ncName?: unknown; mobile?: unknown };
};

function fetchWithInvalidTestCertificate(url: URL, authorization: string): Promise<ProfileResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "GET",
      headers: { Authorization: authorization },
      rejectUnauthorized: false,
      timeout: 12_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 100_000) request.destroy(new Error("Profile response exceeded size limit"));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? 0}`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as ProfileResponse); }
        catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Profile request timed out")));
    request.on("error", reject);
    request.end();
  });
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "当前环境暂不支持账号资料查询" }, { status: 403 });
  }

  const token = process.env.CYBERANTT_API_TOKEN?.trim().replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "账号资料接口尚未配置" }, { status: 503 });

  try {
    const base = (process.env.CYBERANTT_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
    const url = new URL(`${base}/zy/baseInfo/profile`);
    if (url.protocol !== "https:" || url.pathname !== PROFILE_PATH) {
      return NextResponse.json({ error: "用户资料接口地址无效" }, { status: 503 });
    }

    const allowInvalidCertificate = process.env.CYBERANTT_ALLOW_INVALID_TEST_CERT === "true"
      && url.hostname === "test-2026.cyberantt.com";
    let payload: ProfileResponse;
    if (allowInvalidCertificate) {
      payload = await fetchWithInvalidTestCertificate(url, token);
    } else {
      const response = await fetch(url, { headers: { Authorization: token }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      payload = await response.json() as ProfileResponse;
    }

    if (Number(payload.code) !== 200 || !payload.data || typeof payload.data !== "object") {
      return NextResponse.json({ error: "账号资料暂不可用" }, { status: 502 });
    }

    const name = typeof payload.data.ncName === "string" ? payload.data.ncName.trim().slice(0, 80) : "";
    const mobile = typeof payload.data.mobile === "string" ? payload.data.mobile.trim() : "";
    const maskedMobile = /^\d{11}$/.test(mobile) ? `${mobile.slice(0, 3)}****${mobile.slice(-4)}` : undefined;
    return NextResponse.json({ profile: { name: name || "企业客户", maskedMobile } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "账号资料暂不可用" }, { status: 502 });
  }
}
