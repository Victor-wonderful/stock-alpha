import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // color-mix 래핑: CSS 변수 컬러에도 알파 수정자(bg-bull/40 등)가 작동
        ...Object.fromEntries(
          (
            [
              ["bg", "--bg"],
              ["surface", "--surface"],
              ["surface-2", "--surface-2"],
              ["surface-3", "--surface-3"],
              ["border", "--border"],
              ["border-strong", "--border-strong"],
              ["border-soft", "--border-soft"],
              ["text", "--text"],
              ["text-dim", "--text-dim"],
              ["text-mute", "--text-mute"],
              ["accent", "--accent"],
              ["accent-2", "--accent-2"],
              ["accent-dim", "--accent-dim"],
              ["accent-soft", "--accent-soft"],
              ["text-on-accent", "--text-on-accent"],
              // bull/bear → good/bad 로 리매핑 (기존 코드 하위 호환)
              ["bull", "--bull"],
              ["bull-soft", "--bull-soft"],
              ["bear", "--bear"],
              ["bear-soft", "--bear-soft"],
              // V3 명칭
              ["good", "--good"],
              ["good-soft", "--good-soft"],
              ["bad", "--bad"],
              ["bad-soft", "--bad-soft"],
              ["warn", "--warn"],
              ["warn-soft", "--warn-soft"],
            ] as const
          ).map(([name, v]) => [
            name,
            `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`,
          ]),
        ),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Pretendard", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SF Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
