import "server-only";
import type postgres from "postgres";
import { sql } from "./db";
import { needsNumber, nextNumber, STAGES, type Stage } from "./jobs-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = postgres.TransactionSql<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySql = any; // the shared pool or a transaction

/** Fixed key for the lock that makes sure two people can never be given the same job number. */
const NUMBER_LOCK = 557_000;

/**
 * Gives a job the next number. Runs inside a transaction holding a lock,
 * so two people quoting at the same moment always get different numbers.
 */
export async function allocateNumber(tx: Tx, jobId: string): Promise<number> {
  await tx`select pg_advisory_xact_lock(${NUMBER_LOCK})`;
  const [current] = await tx<{ number: number | null }[]>`select number from jobs where id = ${jobId} for update`;
  if (!current) throw new Error("That job doesn't exist.");
  if (current.number !== null) return current.number;
  const [{ used }] = await tx<{ used: number[] }[]>`
    select coalesce(array_agg(n), '{}') as used from (
      select number as n from jobs where number is not null
      union select unnest(also) from jobs
    ) x`;
  const n = nextNumber(used);
  await tx`update jobs set number = ${n}, updated_at = now() where id = ${jobId}`;
  return n;
}

export async function audit(tx: AnySql, actor: string, action: string, entity: string, entityId: string, detail: object = {}) {
  await tx`insert into audit_log (actor, action, entity, entity_id, detail) values (${actor}, ${action}, ${entity}, ${entityId}, ${tx.json(detail as never)})`;
}

/** Moves a job to a new stage, numbering it if it's being quoted for the first time. */
export async function changeStage(jobId: string, stage: Stage, actor: string) {
  if (!STAGES.includes(stage)) throw new Error("Unknown stage.");
  return sql.begin(async (tx) => {
    const [job] = await tx<{ number: number | null; stage: Stage; merged_into: string | null }[]>`
      select number, stage, merged_into from jobs where id = ${jobId} for update`;
    if (!job) throw new Error("That job doesn't exist.");
    if (job.merged_into) throw new Error("This job was merged into another and can't be changed.");
    let number = job.number;
    if (needsNumber(stage, number)) number = await allocateNumber(tx, jobId);
    await tx`update jobs set stage = ${stage}, updated_at = now() where id = ${jobId}`;
    await audit(tx, actor, "stage", "job", jobId, { from: job.stage, to: stage, number });
    return { number, numberBefore: job.number, from: job.stage };
  });
}
