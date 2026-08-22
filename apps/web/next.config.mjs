import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // packages/db 는 tsconfig paths 로 소스 직접 참조 (node_modules 링크 없음).
  // Turbopack 프로젝트 루트를 모노레포 루트로 → ../../packages/db 참조 허용.
  turbopack: {
    root: monorepoRoot,
  },
  // /focus 는 홈이 됐다(IA 1단계, 2026-08-22). 라우트를 지우지 않고 서버 레벨에서
  // 넘긴다 — 리포트 본문·블로그·북마크에 /focus 링크가 남아 있고, 404 가 되면
  // «픽이 사라졌다»로 읽힌다.
  // 페이지 안에서 redirect() 를 쓰면 루트 레이아웃이 이미 스트리밍된 뒤라 Next 가
  // «1초 뒤 meta refresh» 폴백으로 내려간다(실측). 여기서 처리하면 즉시 넘어간다.
  async redirects() {
    return [{ source: "/focus", destination: "/", permanent: true }];
  },
};

export default nextConfig;
