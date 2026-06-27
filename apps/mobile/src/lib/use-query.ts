import { useCallback, useEffect, useState } from 'react';

/**
 * 모든 쿼리 함수의 공통 반환 형태 — 웹의 Loaded<T> 와 동일.
 * isSample=true 면 DB 미연동/실패로 목업 데이터를 보여주는 중.
 */
export type Loaded<T> = { data: T; isSample: boolean };

export type QueryState<T> = {
  data: T;
  loading: boolean;
  isSample: boolean;
  error: unknown;
  refetch: () => void;
};

/**
 * Supabase 쿼리 함수를 화면에서 쓰기 위한 훅.
 * - fn 은 Loaded<T> 를 resolve (실패 시 함수 내부에서 목업 폴백).
 * - fallback 은 첫 렌더(로딩 중) 동안 보여줄 목업.
 * 외부 의존성 없이 useEffect 기반 — 화면 단위 단발성 조회에 충분.
 */
export function useQuery<T>(fn: () => Promise<Loaded<T>>, fallback: T): QueryState<T> {
  const [state, setState] = useState<{ data: T; loading: boolean; isSample: boolean; error: unknown }>({
    data: fallback,
    loading: true,
    isSample: true,
    error: null,
  });

  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((res) => {
        if (!alive) return;
        setState({ data: res.data, loading: false, isSample: res.isSample, error: null });
      })
      .catch((error) => {
        if (!alive) return;
        // 쿼리 함수가 자체 폴백하지 못한 예외 — 화면은 fallback 유지.
        setState({ data: fallback, loading: false, isSample: true, error });
      });
    return () => {
      alive = false;
    };
    // fallback 은 모듈 상수(목업)라 deps 에서 제외 — fn 변경 시에만 재조회.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);

  useEffect(() => run(), [run]);

  return { ...state, refetch: run };
}
