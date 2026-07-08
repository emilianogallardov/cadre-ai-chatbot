# Conversation Decision Tree

The agent should behave as a constrained support concierge, not a general
autonomous agent. The model handles natural language; deterministic code owns
validation, side effects, and data access.

```mermaid
flowchart TD
    A["User enters text or optional voice"] --> B["Client normalizes input"]
    B --> C{"Valid and within limits?"}
    C -- "No" --> C1["Show local validation error"]
    C -- "Yes" --> D["POST bounded conversation to chat API"]
    D --> E["Server applies rate and abuse checks"]
    E --> F{"Request allowed?"}
    F -- "No" --> F1["Return rate-limit or safety response"]
    F -- "Yes" --> G["Assemble system policy + curated KB + recent turns"]
    G --> H["Model identifies answer or allowed action"]
    H --> I{"Route"}

    I -- "Known public fact" --> J["Answer from curated KB"]
    J --> J1["Attach relevant Cadre source/CTA"]

    I -- "Strategy or booking intent" --> K["show_strategy_contact"]
    K --> K1["Display verified contact route"]

    I -- "Maturity Index intent" --> L["show_maturity_index_path"]
    L --> L1["Explain index and offer verified contact route"]

    I -- "Portal help" --> M["show_portal_help"]
    M --> M1{"Public info sufficient?"}
    M1 -- "Yes" --> M2["Explain portal purpose and general next step"]
    M1 -- "No/account-specific" --> N["Offer human escalation"]

    I -- "Unknown, pricing, or client-specific" --> N
    N --> O{"User wants follow-up?"}
    O -- "No" --> O1["Provide contact page and stop"]
    O -- "Yes" --> P["Request minimum contact fields and consent"]
    P --> Q{"Fields valid and consented?"}
    Q -- "No" --> Q1["Ask only for missing/invalid field"]
    Q -- "Yes" --> R["create_escalation on server"]
    R --> S{"Persisted?"}
    S -- "Yes" --> S1["Confirm with reference ID"]
    S -- "No" --> S2["Explain failure; show direct contact route"]

    I -- "Unsafe or unrelated" --> T["Brief boundary response + redirect"]
```

## Routing rules

1. Answer directly only when the curated knowledge base supports the claim.
2. Do not infer service pricing, client account status, contractual terms,
   compliance certifications, or a portal URL.
3. For data security questions, describe Cadre's published approach. Do not
   promise a specific architecture or certification for a hypothetical client.
4. Treat contact information as optional until the user explicitly requests
   human follow-up.
5. Require consent before persisting an escalation.
6. Voice is an input/output adapter around the same text flow. It never creates
   a second agent path.

## Why not a large intent router?

The MVP has four meaningful outcomes: answer, show a verified CTA, collect an
escalation, or decline safely. A large classifier or multi-agent graph would add
latency and failure modes without improving those outcomes. Structured tools and
explicit policies provide enough control while keeping the code explainable.
