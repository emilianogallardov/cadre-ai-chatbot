# ADR-001: Curated Static Knowledge Before RAG

- Status: Accepted
- Date: 2026-07-08

## Context

The public crawl contains roughly 71,000 words across 97 pages, but the six
required support scenarios rely on a small subset of stable facts. Sending the
entire corpus with each request would increase cost and reduce clarity.

## Decision

Store a compact, versioned knowledge base in the repository and supply only that
approved content to the model. Preserve the broader crawl for research and
future retrieval.

## Alternatives considered

1. Put all website text in the system prompt: simplest ingestion, but expensive,
   noisy, and difficult to audit.
2. Add vector retrieval now: scalable, but introduces chunking, embeddings,
   ranking, evaluation, and another failure mode.
3. Curate a static knowledge layer: smallest and most explainable solution for
   the evaluated scenarios.

## Consequences

- Fast, inexpensive requests and transparent knowledge boundaries
- Manual review when source content changes
- Migration to retrieval when the curated context or per-client content no
  longer fits cleanly

## Revisit when

The support corpus exceeds the practical prompt budget, users need deep article
search, or authenticated clients need document-specific answers.
