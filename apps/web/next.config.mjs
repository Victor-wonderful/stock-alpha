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
};

export default nextConfig;
