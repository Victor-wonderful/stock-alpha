import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";

export default function WatchlistPage() {
  return (
    <AppShell title="워치리스트" subtitle="관심 종목">
      <EmptyState message="관심 종목을 추가하면 여기서 모아 봅니다 (로그인 후 사용 · 준비 중)." />
    </AppShell>
  );
}
