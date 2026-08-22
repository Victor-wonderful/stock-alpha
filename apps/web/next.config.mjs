import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 빌드 폴더를 환경변수로 가를 수 있게 한다(기본은 그대로 .next).
  //
  // 왜 (2026-08-22) — 개발 서버 두 개를 동시에 띄우면 둘 다 apps/web/.next 에 쓴다.
  // 하나는 webpack(`next dev`), 하나는 turbopack(`next dev --turbopack`)이라 서로
  // 다른 형식을 같은 폴더에 얹어 양쪽이 함께 죽었다:
  //   Cannot find module './vendor-chunks/next.js'
  //   Could not find the module "…/link.js#default" in the React Client Manifest
  // 코드 문제로 보이지만 폴더 충돌이다. 검증용 서버는 NEXT_DIST_DIR 를 줘서 가른다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // packages/db 는 tsconfig paths 로 소스 직접 참조 (node_modules 링크 없음).
  // Turbopack 프로젝트 루트를 모노레포 루트로 → ../../packages/db 참조 허용.
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
