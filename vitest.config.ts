import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // The database tests share one throwaway database, so test files run one at a time.
  test: { environment: "node", fileParallelism: false },
});
