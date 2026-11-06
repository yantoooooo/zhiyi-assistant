"use client";

import { useEffect, useState } from "react";

export type CustomerProfile = {
  id?: string;
  name: string;
  companyName?: string;
  maskedMobile?: string;
  source?: "configured-test-token";
};

const WEBSITE_ORIGINS = ["https://www.cyberantt.com", "http://47.107.120.126:8080"];

function allowedParentOrigins() {
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_PARENT_ORIGINS?.split(",") ?? [];
  return new Set([window.location.origin, ...WEBSITE_ORIGINS, ...configured.map((origin) => origin.trim())].filter(Boolean));
}

function maskMobile(value: unknown) {
  if (typeof value !== "string") return undefined;
  const mobile = value.trim();
  return /^\d{11}$/.test(mobile) ? `${mobile.slice(0, 3)}****${mobile.slice(-4)}` : undefined;
}

function readProfile(value: unknown): CustomerProfile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name : candidate.ncName;
  const maskedMobile = typeof candidate.maskedMobile === "string" && /^\d{3}\*{4}\d{4}$/.test(candidate.maskedMobile)
    ? candidate.maskedMobile
    : maskMobile(candidate.mobile);
  if (typeof name !== "string" && !maskedMobile) return null;
  return {
    id: typeof candidate.id === "string" ? candidate.id.slice(0, 100) : typeof candidate.cusCode === "string" ? candidate.cusCode.slice(0, 100) : undefined,
    name: (typeof name === "string" ? name.trim() : "").slice(0, 80) || "企业客户",
    companyName: typeof candidate.companyName === "string" ? candidate.companyName.trim().slice(0, 120) : undefined,
    maskedMobile,
  };
}

export function useCustomerProfile() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    if (window.parent === window) {
      let active = true;
      void fetch("/api/customer/profile", { cache: "no-store" })
        .then(async (response) => response.ok ? await response.json() as { profile?: unknown } : null)
        .then((result) => {
          if (!active) return;
          const testProfile = readProfile(result?.profile);
          if (testProfile) setProfile({ ...testProfile, source: "configured-test-token" });
        })
        .catch(() => { /* Guest state remains visible when the test API is unavailable. */ });
      return () => { active = false; };
    }
    const allowedOrigins = allowedParentOrigins();

    function receiveProfile(event: MessageEvent) {
      if (event.source !== window.parent || !allowedOrigins.has(event.origin)) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object") return;
      const message = data as Record<string, unknown>;
      if (message.type === "zhiyi.customer.profile") setProfile(readProfile(message.profile));
      if (message.type === "zhiyi.customer.clear") setProfile(null);
    }

    window.addEventListener("message", receiveProfile);
    for (const origin of allowedOrigins) {
      window.parent.postMessage({ type: "zhiyi.customer.ready" }, origin);
    }
    return () => window.removeEventListener("message", receiveProfile);
  }, []);

  return profile;
}
