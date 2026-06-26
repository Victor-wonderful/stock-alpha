import { createClient } from '@supabase/supabase-js';

/**
 * 웹과 동일한 Supabase 백엔드를 공유한다.
 * 분석 테이블(signals/recommendations/factor_scores)은 읽기,
 * 사용자 테이블(watchlists/alerts/broker_credentials)은 RLS(user_id = auth.uid())로 보호.
 *
 * 환경변수는 apps/mobile/.env.local 에 설정 (EXPO_PUBLIC_* 만 클라이언트 노출).
 *   EXPO_PUBLIC_SUPABASE_URL=...
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
 * service_role 키·broker 키는 절대 앱에 넣지 않는다.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, anonKey, {
  auth: {
    // TODO(인증 단계): @react-native-async-storage/async-storage 어댑터로 세션 유지
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const hasSupabaseConfig = Boolean(url && anonKey);
