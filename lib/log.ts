// =============================================================================
// One-line structured logging.
//
// Vercel surfaces stdout/stderr as searchable logs, so the cheapest way to
// get queryable observability is to emit a single JSON line per significant
// decision point. Two functions: log() for info, logError() for errors.
//
// Fields:
//   ts     — ISO timestamp
//   level  — "info" | "error"
//   event  — short stable identifier ("youcan.webhook.received")
//   ...   — caller-supplied context, must be JSON-serialisable
//
// IMPORTANT: do not pass anything sensitive (access tokens, refresh tokens,
// webhook secrets, raw customer PII). Merchant id, YouCan order id, intents,
// HTTP statuses, counts are all fine.
// =============================================================================

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Context = Record<string, Json | undefined>;

function emit(level: 'info' | 'error', event: string, data: Context | undefined): void {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  };
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) line[k] = v;
    }
  }
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else console.log(out);
}

export function log(event: string, data?: Context): void {
  emit('info', event, data);
}

export function logError(event: string, data?: Context): void {
  emit('error', event, data);
}
