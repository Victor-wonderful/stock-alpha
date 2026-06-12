import { AppShell } from "@/components/AppShell";

export default function AlertsPage() {
  return (
    <AppShell
      title="알림"
      subtitle="조건 충족 시 자동 알림"
    >
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-border bg-surface p-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-[12px] bg-surface-3">
          <span className="text-2xl" aria-hidden>🔔</span>
        </div>
        <h2 className="text-base font-semibold text-text">알림 기능 준비 중</h2>
        <p className="max-w-xs text-sm leading-relaxed text-text-mute">
          목표가 도달, 손절선 접근, 레짐 전환 등 조건을 설정하면
          자동으로 알림을 받을 수 있습니다. 다음 업데이트에서 공개됩니다.
        </p>
      </div>
    </AppShell>
  );
}
