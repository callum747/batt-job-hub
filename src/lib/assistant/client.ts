import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** The model for the background jobs: reading emails, supplier invoices and drawings. */
export const MODEL = "claude-opus-5-5";
/** The model Ask talks with: Opus, unless ASSISTANT_MODEL in Replit Secrets names another. */
export const ASK_MODEL = process.env.ASSISTANT_MODEL?.trim() || MODEL;

/** How a line the app adds to a message starts, so it can be told apart from what the person typed. */
export const APP_NOTE = "[From the app, not the user] ";

export const assistantConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** The Anthropic client. A key made outside a workspace needs to say which workspace to use. */
export function anthropic() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
}

/** A plain-words reason for a failed call. */
export function explainAiError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return "The assistant's API key isn't working. Check ANTHROPIC_API_KEY in Replit Secrets.";
  if (err instanceof Anthropic.RateLimitError) return "The assistant is busy (rate limit). Wait a minute and try again.";
  if (err instanceof Anthropic.APIError) {
    // A 400 means the app sent something the service didn't accept: show its reason so it can be fixed.
    const reason = (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
    if (err.status === 400 && /workspace/i.test(reason))
      return "The API key isn't linked to a workspace. In the Anthropic Console, make a new key inside a workspace and put it in Replit Secrets as ANTHROPIC_API_KEY (or add ANTHROPIC_WORKSPACE_ID with the workspace's ID).";
    return err.status === 400
      ? `The assistant service didn't accept the request: ${reason}`
      : `The assistant service had a problem (${err.status ?? "no status"}). Try again in a moment.`;
  }
  return err instanceof Error ? err.message : String(err);
}
