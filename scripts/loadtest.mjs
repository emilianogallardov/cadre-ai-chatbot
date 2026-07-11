#!/usr/bin/env node
/**
 * loadtest.mjs — concurrent load generator for POST /api/chat.
 *
 * Zero dependencies (Node 20+, global fetch). Drives N virtual users looping
 * chat turns against a target, reads each NDJSON stream to completion, and
 * reports latency/status statistics. Reviewer-facing: read it, then run it.
 *
 *   node scripts/loadtest.mjs --url http://localhost:3000 \
 *     --concurrency 25 --duration 30 [--scenario short|long] [--json]
 *
 * Safety: the target defaults to localhost and the script REFUSES a
 * non-localhost URL unless --i-know-this-spends is passed. The deployed app
 * spends a metered OpenRouter key under a global daily cap (ADR-006), so a load
 * test against prod is both a real spend event and a self-inflicted DoS that
 * burns the demo budget. Prove the pipeline locally against the keyless mock.
 *
 * Rate limiting is correct behavior, not failure: 429s are their own bucket and
 * are honored (the virtual user sleeps Retry-After before continuing). ONLY
 * 429s are exempt from the verdict — the process exits non-zero on any 5xx,
 * non-429 4xx, transport failure, streamed terminal `error` event, or
 * malformed/incomplete NDJSON stream.
 */

function parseArgs(argv) {
  const args = {
    url: "http://localhost:3000",
    concurrency: 25,
    duration: 30,
    scenario: "short",
    json: false,
    spendOk: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (a === "--duration") args.duration = Number(argv[++i]);
    else if (a === "--scenario") args.scenario = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--i-know-this-spends") args.spendOk = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!["short", "long"].includes(args.scenario)) {
    console.error(`--scenario must be "short" or "long", got "${args.scenario}"`);
    process.exit(2);
  }
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) {
    console.error("--concurrency must be a positive number");
    process.exit(2);
  }
  if (!Number.isFinite(args.duration) || args.duration < 1) {
    console.error("--duration must be a positive number (seconds)");
    process.exit(2);
  }
  return args;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isLocalhost(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** A valid single-turn payload (scenario "short"). */
function shortPayload() {
  return { messages: [{ role: "user", content: "What does Cadre AI do?" }] };
}

/**
 * A valid full window near the char budget (scenario "long"): 11 messages,
 * alternating user/assistant and ending on the user turn (an even count would
 * end on an assistant turn and fail validateMessages). ~700 chars each keeps
 * every message under maxMessageChars (2000) and the total just under
 * maxTotalChars (8000) — the heaviest request the server will accept.
 */
function longPayload() {
  const filler = "Cadre AI is an AI strategy and implementation consultancy. ".repeat(12).slice(0, 690);
  const messages = [];
  for (let i = 0; i < 11; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push({ role, content: `${filler} [turn ${i}]` });
  }
  return { messages };
}

function buildBody(scenario) {
  return JSON.stringify(scenario === "long" ? longPayload() : shortPayload());
}

/** Hard per-request deadline so a stalled stream can never hang the run. */
const REQUEST_DEADLINE_MS = 60_000;

/** Drive one chat turn; returns a record the aggregator buckets. */
async function oneTurn(url, body, { collectText = false } = {}) {
  const started = performance.now();
  let ttfb = null;
  let res;
  // Bounded deadline + no redirects: a redirect could silently retarget the
  // request past the hostname guard, and a never-closing stream would
  // otherwise block Promise.all long after --duration.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  try {
    try {
      res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        redirect: "error",
        signal: controller.signal,
      });
    } catch (err) {
      return { status: 0, error: String(err?.message ?? err) };
    }

    const status = res.status;
    if (status !== 200) {
      // Error responses are a single NDJSON line; drain and read Retry-After.
      await res.text().catch(() => "");
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      return { status, ttfb: performance.now() - started, retryAfter };
    }

    if (!res.body) {
      return { status, malformed: true, ttfb: performance.now() - started };
    }

    // Stream the NDJSON body to completion, tracking TTFB and terminal event.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let terminal = null; // "done" | "error"
    let sawError = false; // sticky: a later `done` must not mask an error
    let malformed = false;
    let text = "";
    const consume = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed);
        if (evt.type === "done" || evt.type === "error") {
          if (evt.type === "error") sawError = true;
          // A second terminal event is a protocol violation in itself.
          if (terminal !== null) malformed = true;
          terminal = evt.type;
        }
        if (collectText && evt.type === "text") text += evt.delta ?? "";
      } catch {
        malformed = true;
      }
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (ttfb === null) ttfb = performance.now() - started;
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffered.indexOf("\n")) >= 0) {
          consume(buffered.slice(0, nl));
          buffered = buffered.slice(nl + 1);
        }
      }
      consume(buffered);
    } catch (err) {
      // Deadline abort or mid-stream transport failure.
      return {
        status,
        ttfb,
        malformed: true,
        error: String(err?.message ?? err),
      };
    } finally {
      reader.cancel().catch(() => {});
    }
    // A 200 stream that never reached a terminal event is a protocol violation.
    if (terminal === null) malformed = true;
    return {
      status,
      ttfb: ttfb ?? performance.now() - started,
      total: performance.now() - started,
      terminal,
      sawError,
      malformed,
      text,
    };
  } finally {
    clearTimeout(deadline);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function bucketOf(status) {
  if (status === 200) return "ok";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "serverError";
  if (status >= 400) return "clientError";
  return "network"; // status 0 == transport failure
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isLocalhost(args.url) && !args.spendOk) {
    console.error(
      `\nREFUSING to load-test a non-localhost target: ${args.url}\n\n` +
        "The deployed app spends a metered OpenRouter key under a global daily\n" +
        "cap (ADR-006). Hammering it is a real spend event AND a self-DoS that\n" +
        "burns the demo budget for everyone. Test locally against the keyless\n" +
        "mock (npm run build && npm start). If you truly mean to spend real\n" +
        "budget on a small controlled burst, re-run with --i-know-this-spends.\n",
    );
    process.exit(2);
  }

  const body = buildBody(args.scenario);

  // Preflight (localhost only): a single probe turn proves the target is in
  // MOCK mode before any fan-out. "localhost" does NOT mean "zero spend" —
  // `next start` loads .env.local, and a developer's real OPENROUTER_API_KEY
  // there would turn this load test into a concurrent real-model spend event.
  if (isLocalhost(args.url) && !args.spendOk) {
    const probe = await oneTurn(args.url, buildBody("short"), {
      collectText: true,
    });
    const looksMock =
      probe.status === 200 && (probe.text ?? "").includes("(Mock response");
    if (!looksMock) {
      console.error(
        `\nREFUSING to fan out: the localhost target did not answer with the` +
          ` keyless mock (probe status ${probe.status}).\n\n` +
          "If OPENROUTER_API_KEY is set (e.g. via .env.local), every load-test\n" +
          "request spends real money at high concurrency. Start the server\n" +
          "explicitly keyless:\n\n" +
          "  OPENROUTER_API_KEY= npm start\n\n" +
          "or, to intentionally load real spend, re-run with --i-know-this-spends.\n",
      );
      process.exit(2);
    }
  }

  const results = [];
  const endAt = Date.now() + args.duration * 1000;

  const worker = async () => {
    while (Date.now() < endAt) {
      const r = await oneTurn(args.url, body);
      results.push(r);
      if (r.status === 429 && r.retryAfter > 0) {
        // Honor the limiter: a 429 is correct under load, not a failure. Cap
        // the wait at the remaining budget so a long Retry-After (the per-IP
        // window can be up to 60s) never drags the run far past --duration.
        const remaining = endAt - Date.now();
        if (remaining <= 0) break;
        await new Promise((res) => setTimeout(res, Math.min(r.retryAfter * 1000, remaining)));
      }
    }
  };

  const wallStart = performance.now();
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  const wallSeconds = (performance.now() - wallStart) / 1000;

  // Aggregate.
  const buckets = { ok: 0, rateLimited: 0, clientError: 0, serverError: 0, network: 0 };
  const ttfbs = [];
  const totals = [];
  let malformed = 0;
  let terminalErrors = 0;
  for (const r of results) {
    buckets[bucketOf(r.status)]++;
    if (r.malformed) malformed++;
    if (r.sawError) terminalErrors++;
    if (r.status === 200) {
      if (typeof r.ttfb === "number") ttfbs.push(r.ttfb);
      if (typeof r.total === "number") totals.push(r.total);
    }
  }
  ttfbs.sort((a, b) => a - b);
  totals.sort((a, b) => a - b);
  const round = (n) => Math.round(n);
  const stats = (arr) => ({
    p50: round(percentile(arr, 50)),
    p95: round(percentile(arr, 95)),
    p99: round(percentile(arr, 99)),
  });

  const report = {
    target: args.url,
    scenario: args.scenario,
    concurrency: args.concurrency,
    durationSec: args.duration,
    wallSeconds: Number(wallSeconds.toFixed(2)),
    requests: results.length,
    throughputPerSec: Number((results.length / wallSeconds).toFixed(2)),
    status: buckets,
    malformedStreams: malformed,
    terminalErrorEvents: terminalErrors,
    ttfbMs: stats(ttfbs),
    totalMs: stats(totals),
  };

  // ONLY 429s are exempt: they are the limiter working. Everything else —
  // 5xx, non-429 4xx (validation rejecting the tool's own payloads),
  // transport failures, terminal error events, malformed/incomplete
  // streams — means the system or the tool is broken and must fail loudly.
  const failed =
    buckets.serverError > 0 ||
    buckets.clientError > 0 ||
    buckets.network > 0 ||
    terminalErrors > 0 ||
    malformed > 0;

  if (args.json) {
    console.log(JSON.stringify({ ...report, failed }, null, 2));
  } else {
    console.log(`\nLoad test — ${report.target} (${report.scenario})`);
    console.log(`  concurrency ${report.concurrency} · duration ${report.durationSec}s · wall ${report.wallSeconds}s`);
    console.log(`  requests ${report.requests} · throughput ${report.throughputPerSec}/s`);
    console.log(
      `  status: 200=${buckets.ok} 429=${buckets.rateLimited} ` +
        `4xx=${buckets.clientError} 5xx=${buckets.serverError} net-fail=${buckets.network}`,
    );
    console.log(`  malformed streams: ${malformed} · terminal error events: ${terminalErrors}`);
    console.log(`  TTFB ms   p50=${report.ttfbMs.p50} p95=${report.ttfbMs.p95} p99=${report.ttfbMs.p99}`);
    console.log(`  total ms  p50=${report.totalMs.p50} p95=${report.totalMs.p95} p99=${report.totalMs.p99}`);
    console.log(
      `  verdict: ${failed ? "FAIL (5xx/4xx/net-fail/error-event/malformed present)" : "PASS"}\n`,
    );
  }

  process.exit(failed ? 1 : 0);
}

main();
