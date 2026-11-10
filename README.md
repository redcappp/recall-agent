# Recall

A research assistant that remembers dated conversations and checks what changed. Built for the minimi hiring challenge with exactly one model tool: web search.

## Run

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Select **API key settings**, enter an Anthropic key and a Tavily key, and start chatting. Keys are held in page memory; refreshing clears them. Provider usage charges apply. Alternatively copy `.env.example` to `.env` and fill both keys (PowerShell: `Copy-Item .env.example .env`). Restart after changing `.env`. `MODEL` and `PORT` are optional overrides.

## What it does

- Keeps original questions, answers, timestamps, timezones and retrieved source snapshots across restarts.
- Gives the model dated history automatically; no extra memory tool.
- Searches in parallel within a bounded loop, with explicit failure evidence.
- Renders sanitized Markdown, comparison tables and clickable sources.
- Offers responsive layout, keyboard submission (Enter; Shift+Enter for newline), key settings and JSON history export.

## Code map

| File | Responsibility |
|---|---|
| `server.js` | HTTP boundary, session isolation, provider calls, bounded agent loop, atomic persistence |
| `memory.js` | Context projection and research policy |
| `public/app.js` | Key setup, progress stream, safe answer rendering and evidence UI |
| `public/style.css` | Responsive visual system |
| `server.test.js` | Offline HTTP integration with mocked providers |
| `memory.test.js` | Memory preservation and overflow checks |

Run `npm test`. The integration test executes a model tool request, search result, synthesis and persisted history; it also checks session isolation, credential exclusion, malformed keys, cross-origin rejection and provider authentication failure. It does **not** establish live answer quality. See `EVALUATION.md` for remaining checks and `DESIGN.md` for decisions.

## Storage and limitations

Ignored `data/` files contain private conversation history. A random HttpOnly cookie identifies a browser; losing it loses normal access to that history. Export before clearing cookies. This is a single-process localhost application, not an authenticated public service. No analytics, external fonts, or CDN scripts are loaded. Keys are sent only through the server to the corresponding provider and are not put in model messages or saved history. History itself is sent to Anthropic; search queries are sent to Tavily. Use HTTPS and authentication before hosting remotely.

The archive is injected as context with bounded source excerpts; full snapshots remain on disk. Very large histories fail explicitly rather than silently forgetting. Search citation accuracy and date reasoning are model-dependent. Progress is streamed, but answer tokens are not. Requests have provider timeouts and a loop deadline checked between calls; an in-flight call may finish after that deadline.
