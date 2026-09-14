import { AdminHeader } from "@/components/AdminShell";
import { getSessionUser } from "@/lib/session";

/**
 * 관리 호스트의 레이아웃 — 머리 하나. 푸터·탭바는 루트 레이아웃이 관리 호스트에서
 * 스스로 뺀다(x-vecta-admin 헤더).
 *
 * 제목은 여기서만 정한다. 각 화면이 metadata 를 안 내보내는 이유(404 를 받은 사람의
 * 탭에 「관리」가 뜬다)는 회원 호스트의 이야기였다 — 지금 회원 호스트의 /admin 은
 * 이 레이아웃에 닿기 전에 미들웨어가 «없는 주소»로 바꿔 버리므로, 여기 제목은
 * 관리 호스트에서 실제로 화면을 본 사람에게만 뜬다.
 */
export const metadata = { title: "VECTA 관리" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader signedIn={user !== null} />
      {children}
    </div>
  );
}
