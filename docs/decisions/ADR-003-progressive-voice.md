# ADR-003: Voice as Progressive Enhancement

- Status: Accepted
- Date: 2026-07-08

## Context

Voice can make the demonstration distinctive, but the rubric evaluates a
functional chatbot, architecture, scope, verification, and AI-assisted
development. Browser speech recognition support and privacy behavior vary.

## Decision

Make text chat the canonical experience. Add opt-in voice input and output as an
adapter around the same messages, preferably using browser capabilities for the
MVP. Hide or disable unsupported controls without degrading chat.

## Alternatives considered

1. Browser speech APIs: fastest and no application audio backend, but uneven
   support and browser/vendor privacy considerations.
2. Hosted speech model API: more consistent control, but adds cost, latency,
   audio handling, and credentials.
3. Realtime voice agent: impressive, but a separate interaction architecture
   and disproportionate to the support brief.

## Consequences

- The app remains complete when voice is unavailable
- Voice must be user-triggered and never autoplay
- The privacy note must not claim audio stays entirely on-device unless the
  chosen browser implementation verifies that claim

## Revisit when

Voice becomes a required production channel or cross-browser recognition is a
hard requirement.
