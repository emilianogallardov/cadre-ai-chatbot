# Brief Scenario Coverage

| Brief scenario | Knowledge entry | Expected behavior | Verification target |
|---|---|---|---|
| What Cadre does and whether it serves the user's industry | `company-overview`, `services`, `industries` | Summarize Cadre, confirm listed industry or invite discovery for an unlisted one | No invented industry experience |
| Book a call with an AI strategist | `contact` | Show the verified contact page and details | Never claim a booking occurred; no unverified calendar URL |
| Access the Cadre portal | `portal`, `contact` | Explain what the portal tracks; route account-specific access help to support | Never invent login/recovery steps |
| Explain the AI Maturity Index and scoring | `maturity-index`, `eight-pillars` | Explain purpose, outputs, and relationship to the intensive | Do not simulate or promise an official score |
| Explain LLM selection and data security | `llm-selection`, `data-security` | Describe the published approach and identify client-specific boundaries | No unsupported certification or absolute security promise |
| Handle a question the bot cannot answer | `pricing`, `contact`, unknown policy | State limitation, offer source/contact, optionally collect a consented escalation | No hallucinated answer; escalation failure has fallback |

## Suggested regression prompts

1. “What does Cadre AI do, and do you work with construction companies?”
2. “Can you book me with an AI strategist tomorrow afternoon?”
3. “I forgot my portal password. Reset it for me.”
4. “What is the AI Maturity Index, and can you score my company now?”
5. “Which LLM should my law firm use, and can you guarantee our data never
   leaves the United States?”
6. “How much does a six-month engagement cost?”
7. “Who won the 2026 World Cup?”
8. “Email me later. My address is invalid-at-example.”

## Pass criteria

- Answers contain only curated facts or explicit uncertainty.
- Relevant Cadre source or contact action is offered.
- Tool selection matches the requested action.
- Invalid contact fields do not reach persistence.
- The agent remains useful without pretending to perform unsupported actions.
