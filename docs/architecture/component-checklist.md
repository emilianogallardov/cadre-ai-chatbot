# Agent Component Checklist

> **Historical planning artifact (2026-07-08).** Statuses reflect the
> pre-build planning package; the components below have since shipped. For
> execution reality see `plan.md` (phases with commit evidence) and
> `ACTIVITY-TIMELINE.md`.

Status meanings:

- **Ready**: artifact or source data exists in this package.
- **Decided**: architecture is chosen and documented, but not implemented.
- **Pending**: requires an implementation choice or external value.
- **Later**: intentionally excluded from the MVP.

## 1. Experience layer

| Component | Purpose | Status | Decision or dependency |
|---|---|---:|---|
| Chat shell | Primary customer-support experience | Pending | Build in Next.js after planning handoff |
| Message transcript | Show user and assistant turns | Pending | Accessible live region; streaming-safe rendering |
| Composer | Text input, submit, stop, retry | Pending | Must prevent duplicate submissions |
| Suggested prompts | Expose the six evaluated scenarios | Decided | Use scenario coverage file as source |
| Source links | Let users verify public facts | Decided | Show relevant Cadre page links, not citation clutter on every sentence |
| Action cards | Strategy call, Maturity Index, portal help, escalation | Decided | Actions are explicit UI, not buried in prose |
| Voice input | Optional speech-to-text | Decided | Progressive enhancement; text remains canonical |
| Voice output | Optional text-to-speech | Decided | User-controlled; never autoplay |
| Error states | Provider, validation, rate-limit, and unsupported-browser errors | Pending | Copy is defined during UI implementation |
| Mobile and keyboard support | Make the public demo credible | Pending | Required verification item |

## 2. Agent and API layer

| Component | Purpose | Status | Decision or dependency |
|---|---|---:|---|
| Chat endpoint | Validate messages and stream model output | Pending | Server-only OpenRouter call |
| Request schema | Bound message count, length, and roles | Decided | Reject oversized or malformed payloads before model call |
| System prompt | Persona, knowledge boundary, tool rules, refusal behavior | Pending | Built from curated KB, never raw crawl |
| Conversation context | Maintain current session coherence | Decided | Bounded recent messages; summarize only if needed |
| Model gateway | Isolate OpenRouter-specific configuration | Decided | One interface so model can be swapped without UI changes |
| Tool dispatcher | Execute permitted structured actions | Decided | Server-side allowlist with schema validation |
| Unknown-answer policy | Prevent fabricated pricing, portal, or security answers | Ready | Defined in source policy and KB |
| Rate limiting | Protect the public $5 key | Pending | Choose Vercel control or durable limiter before launch |
| Token budget | Cap spend and latency | Decided | Compact KB, bounded history, low output ceiling |
| Provider fallback | Return useful UI error when OpenRouter fails | Decided | Do not silently change models in MVP |

## 3. Knowledge layer

| Component | Purpose | Status | Decision or dependency |
|---|---|---:|---|
| Sitemap crawl | Preserve public Cadre content | Ready | 97/97 URLs captured |
| Raw HTML | Auditable source snapshots | Ready | `data/raw/html/` |
| Normalized Markdown | Human-readable research corpus | Ready | `data/raw/markdown/` |
| Source manifest | Freshness, hashes, status, page type | Ready | `data/raw/manifest.json` |
| Curated support KB | Approved compact context | Ready | `data/curated/knowledge-base.*` |
| Scenario suite | Verify brief coverage | Ready | `data/curated/scenario-coverage.md` |
| RAG/vector index | Scale beyond compact knowledge | Later | Add only when context size or per-client content requires retrieval |
| Automated refresh | Detect site changes | Later | Re-run scraper manually for take-home |

## 4. Action layer

| Tool or action | Inputs | Output | Status |
|---|---|---|---:|
| `show_strategy_contact` | Optional topic summary | Cadre contact URL/email/phone | Decided |
| `show_maturity_index_path` | Optional company context | Explanation and strategist/contact CTA | Decided |
| `show_portal_help` | Optional issue description | Publicly supported portal explanation plus contact route | Decided |
| `create_escalation` | Consent, name, email, question; company optional | Reference ID and follow-up confirmation | Pending |
| Direct calendar booking | Scheduling URL | External booking link | Pending: no verified scheduler URL in public corpus |
| Portal login | Portal URL or authenticated session | Redirect or account-specific help | Pending: no verified public login URL |

Only `create_escalation` mutates data. The other actions can be deterministic
response components and do not need model-controlled side effects.

## 5. Data, operations, and verification

| Component | Status | Notes |
|---|---:|---|
| Versioned public knowledge | Ready | Lives in repository |
| Browser session state | Decided | Memory or `sessionStorage`; no long-lived client profile |
| Escalation database | Pending | Minimal Supabase table if persistence is approved |
| Secrets | Decided | Server-only Vercel environment variables |
| Analytics | Later | No transcript logging by default |
| Scenario tests | Ready as specification | Convert to automated tests during implementation |
| Prompt regression tests | Pending | Test factual answers, boundary behavior, and tool selection |
| Accessibility checks | Pending | Keyboard, screen reader, contrast, reduced motion |
| Live deployment smoke test | Pending | Verify all six scenarios on public URL |

## MVP completeness gate

The chatbot is ready to submit only when:

1. All six brief scenarios produce an accurate answer or safe escalation.
2. Pricing, account access, and unverified security claims are never invented.
3. Model failures, rate limits, and unsupported voice are handled visibly.
4. No API key or database credential reaches the client bundle.
5. The public deployment passes text-chat tests without voice enabled.
