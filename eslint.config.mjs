import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Replit's starter packages are switched off and aren't part of the app.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "artifacts/**", "lib/**", "scripts/src/**"]),
]);
