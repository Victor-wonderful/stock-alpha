import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";

export default function ReportsPage() {
  return (
    <AppShell title="리포트" subtitle="AI 애널리스트 북">
      <EmptyState message="Phase 2 — 종목 인뎁스·정기 마켓·모델 포트폴리오·맞춤형 리포트가 여기서 발행됩니다 (준비 중)." />
    </AppShell>
  );
}
