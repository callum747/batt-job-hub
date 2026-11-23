import "server-only";
import postgres from "postgres";

declare global {
  var __battSql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add it in the app's settings (Secrets on Replit).");
  return postgres(url, {
    max: 5,
    onnotice: () => {},
    // Dates stay as YYYY-MM-DD text and money as exact numbers, never JS Date or float surprises.
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

const pool = () => globalThis.__battSql ?? (globalThis.__battSql = connect());

/**
 * One shared connection pool (kept across hot reloads in development).
 * It connects on first use, so building the app never needs the database.
 */
export const sql = new Proxy(function () {} as unknown as ReturnType<typeof postgres>, {
  apply: (_t, _this, args) => Reflect.apply(pool() as never, undefined, args),
  get: (_t, prop) => {
    const p = pool();
    const v = Reflect.get(p, prop);
    return typeof v === "function" ? v.bind(p) : v;
  },
});
