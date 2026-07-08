# Cadre AI Take-Home Activity Timeline

- Project date: July 8, 2026
- Time zone: America/Los_Angeles
- Current phase: Planning, research, and implementation handoff
- Logging policy: Append-only; never rewrite history to make the process look
  cleaner than it was

This timeline records material actions, decisions, failures, handoffs, and
verification. Low-level terminal commands remain available in session history;
this document captures the project narrative an interviewer can follow.

## Timeline

| ID | Date/time (PDT) | Actor/tool | Action | Rationale or outcome | Evidence/status |
|---|---|---|---|---|---|
| T-001 | 2026-07-08 11:45 | User / terminal | Opened a new terminal session and started the take-home work session. | Establishes the beginning of the recorded workflow. | Terminal login timestamp supplied by user. |
| T-002 | 2026-07-08, time not captured | User / Fable 5 | Submitted the candidate take-home PDF to Fable 5 (“Paper5” in the later voice note) for an initial review. | First step was understanding the assignment before implementation. | User-provided Claude session transcript. |
| T-003 | 2026-07-08, time not captured | Fable 5 | Read and summarized the seven-page challenge guide. | Identified the four hard deliverables, six example scenarios, five weighted rubric categories, and one-hour review structure. | User-provided Claude session transcript and source PDF. |
| T-004 | 2026-07-08, time not captured | User / Fable 5 | Reviewed the recruiting email and extracted deadline, OpenRouter budget, and submission mechanics. | Established Friday-morning submission target and the need to protect the metered API key. No key value was copied into project artifacts. | User-provided Claude session transcript. |
| T-005 | 2026-07-08, time not captured | User | Confirmed interview availability had already been submitted for Friday and Monday-Wednesday of the following week. | Removed scheduling as an immediate task and prioritized Friday submission. | User statement in session transcript. |
| T-006 | 2026-07-08, time not captured | User / Fable 5 | Brainstormed a Next.js/Vercel support concierge with chat, optional voice, grounded knowledge, escalation, rate limits, and explicit scope cuts. | Established the first architecture direction and challenged authentication/RAG as likely overbuilding. | User-provided Claude session transcript. |
| T-007 | 2026-07-08, time not captured | Fable 5 / Codex | Fable 5 hit its session limit while the user requested planning; work moved to Codex. | Preserved momentum without pretending the first session completed the plan. | Session-limit message in user-provided transcript. |
| T-008 | 2026-07-08, before 13:45 | Codex | Re-read the source PDF, rendered key pages, extracted text, and checked the empty workspace. | Verified rubric wording directly instead of relying only on the earlier summary. | `work/tmp/pdfs/cadre/` and session tool output. Complete. |
| T-009 | 2026-07-08, before 13:45 | Codex | Reviewed Cadre's current public site, strategy, engineering, case-study, and contact content. | Confirmed enough public material exists for a compact curated knowledge base. | Official Cadre source links in curated artifacts. Complete. |
| T-010 | 2026-07-08, before 13:45 | User / Codex | Selected the support-concierge direction for planning: text-first chat, progressive voice, no authentication, and no RAG in the MVP. | Aligns feature scope with the rubric's preference for a focused working product. | ADR-001 through ADR-004. Decided for planning; implementation pending. |
| T-011 | 2026-07-08, before 13:45 | User | Requested a complete public-site scrape, agent component map, decision tree, data-location plan, and documentation without wiring the application. | Defined the current phase as research and scaffolding rather than implementation. | User request in Codex thread. |
| T-012 | 2026-07-08 13:45-13:47 | Codex | Created a tested sitemap scraper and ran it against Cadre's public website. Fixed page-type singularization and Webflow content/footer extraction through failing-then-passing tests. | Produced reproducible research data while demonstrating verification of generated code. | 97/97 pages succeeded; 5 unit tests pass; `tools/scrape_site.py`; `data/raw/`. Complete. |
| T-013 | 2026-07-08, approximately 13:48 | Codex | Split the corpus into raw research, curated support knowledge, and excluded/non-default material. | Prevents all 71,000 words from being placed into every prompt and creates an auditable answer boundary. | `data/curated/`, `docs/research/`, ADR-001. Complete. |
| T-014 | 2026-07-08, approximately 13:49-13:53 | Codex | Created the agent component checklist, conversation decision tree, data/storage map, source policy, architecture design, five ADRs, open questions, and scenario coverage. | Mapped every planned component and documented why it exists, where data lives, and what remains unresolved. | `docs/architecture/`, `docs/decisions/`, `docs/plans/`, `docs/open-questions.md`. Complete. |
| T-015 | 2026-07-08, approximately 13:53-13:55 | Codex | Created Fable handoff documents, including implementation sequence and drafts for root `plan.md` and `CLAUDE.md`. | Allows Fable 5 to resume implementation without reconstructing decisions from chat history. | `docs/handoff/`. Complete. |
| T-016 | 2026-07-08, approximately 13:55 | Codex | Ran package verification: scraper tests, Python compilation, JSON/schema assertions, 97-page artifact counts, required-file checks, and secret scan. | Confirmed the planning package's internal consistency before reporting completion. | Verification output in Codex thread: 5 tests, 97 HTML, 97 Markdown, zero crawl failures, no credential values detected. Complete. |
| T-017 | 2026-07-08, approximately 13:56 | User / Codex | Requested a complete rubric checklist; Codex created a 212-item evidence-based checklist. | Converts every deliverable, scenario, rubric category, engineering tip, review segment, and submission action into an explicit gate. | `RUBRIC-CHECKLIST.md`: 18 planning items checked, 194 implementation/verification items intentionally pending. Complete. |
| T-018 | 2026-07-08 13:57 | User / Codex | Requested continuous documentation of the project timeline and an enforcement mechanism for future agents. | Made process traceability a first-class project requirement. | This file and `docs/process/timeline-protocol.md`. Complete. |
| T-019 | 2026-07-08 13:59 | Codex | Created the append-only timeline and logging protocol, then embedded the requirement into the CLAUDE draft, Fable handoff, README, and rubric checklist. | Ensures future primary agents own one canonical history while subagents return structured handoffs instead of editing it concurrently. | Timeline structure, referenced files, handoff instructions, rubric controls, and secret scan verified in the Codex thread. Complete. |
| T-020 | 2026-07-08 16:26 | User / Codex | Requested exact file locations and complete restart context for the Fable 5 session; Codex created a consolidated resume handoff with paths, status, constraints, decisions, and a copy-paste prompt. | Removes ambiguity when resuming from Fable's `/Users/chupee175` working directory and prevents planning decisions from being reconstructed incorrectly. | `FABLE-RESUME.md` and updated README; 14 referenced handoff files and the original PDF verified, future app path confirmed absent, and secret scan clean. Complete. |
| T-021 | 2026-07-08 16:29 | Fable 5 | Resumed the project from `FABLE-RESUME.md`; read the full planning package in the required order (timeline, protocol, rubric checklist, implementation brief, design, architecture docs, curated KB, scenario coverage, five ADRs, open questions, plan/CLAUDE drafts). Reviewed the package and presented the three P0 decisions (model benchmark candidates, rate-limit mechanism, real-vs-demo escalation) to the user with recommendations. | Handoff requires state summary and P0 resolution before any implementation; prevents silently guessing decisions the plan marked as deliberately unresolved. | This session's read log; decision request presented in chat. Complete (review); P0 decisions pending user input. |
| T-022 | 2026-07-08 16:35 | User / Fable 5 | User resolved all three P0 decisions: (1) benchmark three OpenRouter candidates (Claude Haiku-class, one cheap non-Anthropic, Claude Sonnet-class baseline) and select the cheapest that passes the scenario/boundary suite; (2) Upstash Redis rate limiting with per-IP sliding window plus a global daily cap; (3) real Supabase escalation persistence per ADR-005 minimal schema with 30-day retention and contact-link fallback. | Unblocks Phase 0 exit; each resolution will be recorded as an accepted/new ADR in the application repository before the affected component is wired. | User selections in Fable session (AskUserQuestion). Decisions made; ADR updates pending in app repo. |

## Current state at T-018

### Complete

- Source brief reviewed directly
- Public Cadre corpus inventoried and captured
- Curated support knowledge and boundaries documented
- Agent components, routing, data flow, and scope decisions documented
- Rubric checklist created
- Fable implementation handoff prepared

### Not started

- Fresh application repository
- Next.js application scaffold
- Model/API integration
- Database or escalation persistence
- Authentication
- Voice implementation
- Tests for the future application
- Vercel deployment
- GitHub submission repository

The phrase “started scaffolding” refers to the planning/research package, not a
claim that the chatbot application has been scaffolded.

## Next-entry rule

The next material action receives ID `T-021`. Before any agent says a task is
complete, it must append an entry containing:

1. What changed
2. Why it changed
3. Files, commands, URLs, or commits that prove it
4. Whether the result is complete, partial, failed, reverted, or blocked
| T-023 | 2026-07-08 16:36 | Fable 5 | Created the fresh application repository at `cadre-ai-chatbot`, seeded it with the curated KB, scenario coverage, architecture docs, and timeline; accepted ADR-005 (real Supabase escalations, 30-day retention) and added ADR-006 (Upstash rate limiting) and ADR-007 (model-by-benchmark); wrote project-specific root `plan.md` and `CLAUDE.md`; added `.gitignore` and names-only `.env.example`. This repository's copy of the timeline is now canonical. | Executes Phase 0 of plan.md with the user's resolved P0 decisions before any application code. | Root commit `e1d642a` (21 files); no secret values present. Complete. |
