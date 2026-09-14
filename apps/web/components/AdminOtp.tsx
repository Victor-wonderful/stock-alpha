"use client";

import { useActionState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";

import { startEnroll, verifyCode, type EnrollState, type VerifyState } from "@/app/admin/otp/actions";

const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-center text-[22px] tracking-[6px] tnum outline-none focus:border-accent";
const BUTTON =
  "w-full rounded-[9px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2 disabled:opacity-60";

function CodeForm({ factorId, label }: { factorId: string; label: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyCode, { error: null });
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="factorId" value={factorId} />
      <div>
        <label className="block text-[13px] font-semibold text-text" htmlFor="code">
          {label}
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className={FIELD}
        />
      </div>
      {state.error && (
        <div className="flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">{state.error}</p>
        </div>
      )}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "확인 중…" : "확인"}
      </button>
    </form>
  );
}

/** 매 로그인 — 이미 등록한 앱의 코드를 묻는다. */
export function OtpVerify({ factorId }: { factorId: string }) {
  return (
    <>
      <h1 className="flex items-center gap-2 text-[20px] font-bold leading-[1.3] tracking-[-0.3px] text-text">
        <KeyRound className="h-5 w-5 text-accent" aria-hidden />
        인증 코드
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.7] text-text-mute">
        인증 앱(Google Authenticator·1Password 등)에 뜬 6자리를 입력해 주세요.
      </p>
      <CodeForm factorId={factorId} label="6자리 코드" />
    </>
  );
}

/**
 * 첫 등록 — 버튼을 누르면 QR 이 나오고, 앱으로 찍은 뒤 첫 코드를 넣으면 끝.
 * QR 을 못 찍는 상황(폰이 없는 PC 앱)을 위해 비밀키 문자열도 같이 보여 준다.
 */
export function OtpSetup() {
  const [state, action, pending] = useActionState<EnrollState>(startEnroll, { status: "idle" });
  const qr = state.status === "ready" ? state.qr : null;
  const qrIsSvg = qr !== null && qr.trimStart().startsWith("<svg");

  return (
    <>
      <h1 className="flex items-center gap-2 text-[20px] font-bold leading-[1.3] tracking-[-0.3px] text-text">
        <KeyRound className="h-5 w-5 text-accent" aria-hidden />
        인증 앱 등록
      </h1>
      <p className="mt-1.5 text-[13px] leading-[1.7] text-text-mute">
        운영자 계정은 비밀번호만으로는 들어올 수 없습니다. 한 번만 등록하면 이후에는
        로그인할 때 앱의 6자리 코드를 입력합니다.
      </p>

      {state.status === "error" && (
        <div className="mt-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">{state.message}</p>
        </div>
      )}

      {state.status !== "ready" ? (
        <form action={action} className="mt-5">
          <button type="submit" disabled={pending} className={BUTTON}>
            {pending ? "준비 중…" : "QR 코드 만들기"}
          </button>
        </form>
      ) : (
        <>
          <div className="mt-5 rounded-[12px] border border-border bg-surface p-4">
            <p className="text-[12.5px] font-semibold text-text">1. 인증 앱으로 이 QR 을 찍으세요</p>
            <div className="mx-auto mt-3 w-[200px] rounded-[8px] bg-white p-2">
              {qrIsSvg ? (
                <div dangerouslySetInnerHTML={{ __html: qr! }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr!} alt="OTP 등록 QR" width={184} height={184} />
              )}
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-text-mute">
              QR 을 못 찍으면 이 키를 앱에 직접 입력하세요:
              <code className="mt-1 block select-all break-all rounded-[6px] bg-surface-2 px-2 py-1 text-[11px] text-text">
                {state.secret}
              </code>
            </p>
          </div>
          <p className="mt-5 text-[12.5px] font-semibold text-text">2. 앱에 뜬 첫 코드를 입력하세요</p>
          <CodeForm factorId={state.factorId} label="6자리 코드" />
        </>
      )}
    </>
  );
}
