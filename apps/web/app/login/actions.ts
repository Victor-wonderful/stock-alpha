"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSION } from "@/lib/legal";

/**
 * 로그인·회원가입·로그아웃.
 *
 * 돌아갈 곳(`next`)을 인자로 받는다 — 미들웨어가 보호 라우트에서 튕길 때 원래 가려던
 * 곳을 붙여 보내는데, 예전 코드는 그걸 무시하고 언제나 /dashboard 로 보냈다. 「추천
 * 쓰기」를 누르고 로그인했는데 대시보드가 열리면 다시 찾아가야 한다.
 *
 * 열린 리디렉트는 막는다 — 우리 사이트 안의 경로(/로 시작하고 //가 아닌)만 허용한다.
 * 남이 만든 링크로 로그인시킨 뒤 바깥으로 튕기는 수법을 그대로 막아 준다.
 */
function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function fail(next: string, msg: string, mode?: "signup"): never {
  const q = new URLSearchParams({ error: msg });
  if (next !== "/") q.set("next", next);
  if (mode) q.set("mode", mode);
  redirect(`/login?${q.toString()}`);
}

/** 아이디 규격 — DB 의 check 제약(0045)과 **같은 정규식**이어야 한다. */
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{3,19}$/;

export async function signIn(next: string | null, formData: FormData) {
  const to = safeNext(next);
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) fail(to, "아이디와 비밀번호를 모두 입력해 주세요.");

  const supabase = await createClient();

  // 인증 자체는 여전히 이메일로 한다(Supabase 가 그렇게 만들어져 있다). 아이디로
  // 이메일을 찾되, **비밀번호가 맞을 때만** 돌려주는 함수를 쓴다(0045 login_email).
  // 그래서 이 단계에서 남의 이메일이 새거나 «그 아이디가 있는지»가 드러나지 않는다.
  const { data: email, error: rpcError } = await supabase.rpc("login_email", {
    p_username: username,
    p_password: password,
  });
  if (rpcError) fail(to, `로그인하지 못했습니다 — ${rpcError.message}`);
  if (!email) fail(to, "아이디 또는 비밀번호가 맞지 않습니다.");

  const { error } = await supabase.auth.signInWithPassword({
    email: String(email),
    password,
  });
  if (error) {
    // 위에서 비밀번호를 이미 맞춰 봤으므로 여기 오는 건 대개 «메일 확인 전»이다.
    const msg = /email not confirmed/i.test(error.message)
      ? "아직 이메일 확인이 끝나지 않았습니다. 가입할 때 적은 메일의 링크를 눌러 주세요."
      : /invalid login credentials/i.test(error.message)
        ? "아이디 또는 비밀번호가 맞지 않습니다."
        : error.message;
    fail(to, msg);
  }

  revalidatePath("/", "layout"); // 머리의 계정 자리를 새로 그린다
  redirect(to);
}

/** 연락처 — 숫자와 구분자만 받는다. 국내 번호를 전제하되 형식을 좁게 강요하지 않는다. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  return digits;
}

export async function signUp(next: string | null, formData: FormData) {
  const to = safeNext(next);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  // 동의는 둘로 나눈다 — 약관과 개인정보는 다른 문서이고, 하나로 묶으면 «무엇에
  // 동의했나»가 흐려진다.
  const agreeTerms = formData.get("agree_terms") === "on";
  const agreePrivacy = formData.get("agree_privacy") === "on";

  if (!USERNAME_RE.test(username)) {
    fail(to, "아이디는 영문 소문자·숫자·밑줄·하이픈 4~20자로 정해 주세요.", "signup");
  }
  if (!nickname) fail(to, "닉네임을 입력해 주세요.", "signup");
  if (nickname.length > 20) fail(to, "닉네임은 20자 이내로 정해 주세요.", "signup");
  if (!email || !password) fail(to, "이메일과 비밀번호를 모두 입력해 주세요.", "signup");
  if (password.length < 8) {
    fail(to, "비밀번호는 8자 이상으로 정해 주세요.", "signup");
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) fail(to, "연락처를 숫자 9~11자리로 입력해 주세요. (예: 010-1234-5678)", "signup");
  // 동의 없이 저장하지 않는다. 체크박스가 장식이 되면 안 된다 — 화면이 required 를
  // 걸어도 서버가 다시 본다(폼은 우회할 수 있다).
  if (!agreeTerms) fail(to, "이용약관에 동의해야 가입할 수 있습니다.", "signup");
  if (!agreePrivacy) {
    fail(to, "개인정보 수집·이용에 동의해야 가입할 수 있습니다.", "signup");
  }

  const supabase = await createClient();

  // 먼저 아이디 중복을 본다. 인증부터 부르면 계정이 만들어진 뒤 프로필 트리거가
  // 유니크 위반으로 죽어, «가입은 됐는데 프로필이 없는» 반쪽 계정이 남는다.
  const { data: taken } = await supabase.rpc("username_taken", {
    p_username: username,
  });
  if (taken) fail(to, "이미 쓰고 있는 아이디입니다. 다른 것으로 정해 주세요.", "signup");

  // 닉네임·연락처를 **가입 메타데이터**로 넘긴다. 이메일 확인을 쓰는 프로젝트에서는
  // 가입 직후 세션이 없어 profiles 에 직접 못 쓴다 — DB 트리거가 옮긴다(0043).
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // 동의 «시각»은 여기서 만들지 않는다 — DB 트리거가 now() 로 찍는다(0044).
    // 클라이언트나 웹 서버가 보낸 시각을 믿으면 증빙이 되지 않는다.
    options: {
      data: {
        username,
        nickname,
        phone,
        agreed_terms: "true",
        agreed_privacy: "true",
        doc_version: LEGAL_VERSION,
      },
    },
  });
  if (error) {
    const msg = /already registered|already exists/i.test(error.message)
      ? "이미 가입된 이메일입니다. 로그인해 주세요."
      : error.message;
    fail(to, msg, "signup");
  }

  // 프로젝트 설정에 따라 갈린다. 확인 메일을 쓰는 경우 session 이 없다 —
  // 그때 바로 다음 화면으로 보내면 «로그인된 줄 알았는데 아니었던» 상태가 된다.
  // 이메일은 주소창에 싣지 않는다.
  if (!data.session) {
    const q = new URLSearchParams({ sent: "1" });
    if (to !== "/") q.set("next", to);
    redirect(`/login?${q.toString()}`);
  }

  revalidatePath("/", "layout");
  redirect(to);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
