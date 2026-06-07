"use client";

import { createBrowserClient } from "@supabase/ssr";

// 브라우저 클라이언트 — anon 키만 사용 (RLS 적용)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
