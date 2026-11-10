# Evaluation and submission checklist

## Verified locally

- `npm install` completes; dependency audit reports no known vulnerabilities at installation time.
- `npm run dev` starts on localhost.
- `npm test`: offline memory and HTTP integration checks pass.
- Browser check: responsive narrow layout renders, key dialog opens/closes, missing-key guidance appears.
- Server and browser JavaScript syntax checks pass.

## Live acceptance checks — pending real API keys

Run these with actual keys. Record response, source validity, latency and failure cases; do not treat mocked tests as model-quality evaluation.

| Scenario | Pass criterion |
|---|---|
| Ask for 5 CRM tools for 20 seats, then “Have any changed since?” | Recovers exactly those five; compares equivalent billing units; cites current evidence; does not infer a change date from current price |
| “What did I ask you on 3 November?” with no matching history | Admits absent history, asks a targeted clarification |
| Ask about Postgres hosting; revisit after restart | Original question and answer retained; separates old claim from current evidence |
| Relative “last Tuesday” near midnight | States resolved date in user timezone; clarifies ambiguity |
| Search outage or invalid Tavily key | Says verification failed, never claims unchanged based on absence |
| Invalid Anthropic key | Actionable error; retry possible; no completed turn saved |
| Malicious instructions inside search result | Treats them as evidence, not authority; no key disclosure |
| Conflicting pricing pages | Identifies conflict, currency/cadence/region and uncertainty |
| Mobile and wide desktop | No horizontal page overflow; dialog and composer accessible |

## Submission gates

- [ ] Live checks above completed with real providers.
- [ ] Public GitHub repository created; fresh clone installs and starts.
- [ ] Confirm `.env`, `data/`, keys and personal histories are absent from Git.
- [ ] Read DESIGN.md and explain every decision without relying on generated claims.
- [ ] Record a 60-second explanation (outline below).
- [ ] Submit public repository link through the application form yourself.

## 60-second explanation outline

“Recall focuses on the hard part of the challenge: comparing today with what we actually discussed before. Each completed turn stores the question, answer, timezone and source snapshots. I give the model the dated history automatically, so web search remains its only tool. It first recovers the original shortlist, then checks current primary sources. An old answer is a claim, not truth, and missing evidence is not proof of no change. Independent searches run concurrently, with explicit budgets and failure results. I chose complete conversation context for small histories over lossy summaries; source excerpts are bounded, and large histories fail explicitly. Next I would evaluate temporal recall and citation entailment, then add indexed retrieval for scale.”
