import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Panel, Stat } from "@/components/ui";
import { TRADE_STYLE_LABELS, type Profile } from "@stock-alpha/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return (
    <AppShell title="대시보드" subtitle={user.email ?? undefined}>
      <div className="mb-4 flex justify-end">
        <form action={signOut}>
          <button className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-text-dim hover:text-text">
            로그아웃
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="구독 티어" value={profile?.tier ?? "free"} />
        <Stat
          label="기본 투자 스타일"
          value={profile?.default_style ? TRADE_STYLE_LABELS[profile.default_style] : "—"}
        />
        <Stat
          label="트레이드당 리스크"
          value={
            profile?.risk_per_trade_pct != null
              ? `${profile.risk_per_trade_pct}%`
              : "—"
          }
        />
      </div>

      <div className="mt-6">
        <Panel title="내 워치리스트 시그널">
          <EmptyState message="워치리스트에 종목을 추가하면 해당 종목의 최신 시그널이 여기에 표시됩니다." />
        </Panel>
      </div>
    </AppShell>
  );
}
