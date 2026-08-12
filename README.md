# Code Analyzer

LeetCode-style solution analysis. Enter a LeetCode question number and your solution code, and get an AI analysis just like LeetCode Premium - verdict, approach, efficiency, code style and follow-up.

Live: https://lc-analyzer.hariomvirkhare02.workers.dev

## Features

- Enter only the question number (e.g. 242) - problem details are fetched from LeetCode automatically
- Verdict: correct / optimizable / incorrect
- Current vs suggested approach with key idea
- Time & space complexity comparison (yours vs optimal)
- Line-level code style feedback
- Suggestions and follow-up question
- Dark UI with Inter + JetBrains Mono fonts

## What is a Cloudflare Worker?

A Cloudflare Worker is a small piece of JavaScript that runs on Cloudflare's edge network (300+ data centers worldwide) instead of on your own server.

- No server to buy, install, or keep running
- Runs your code close to the user, so it is fast
- Free tier: 100,000 requests per day
- Deploy with a single command

In this project the Worker does two jobs:
1. Serves the frontend (index.html)
2. Acts as the API - fetches the problem from LeetCode and calls Gemini

## Why Cloudflare?

| Problem with a normal server | Cloudflare Worker |
|---|---|
| Need to buy/rent a VPS | Totally free |
| Server must stay online 24/7 | No server, nothing to manage |
| API key exposed to browser if stored client-side | Key stored as a secret, never reaches the browser |
| Request travels to one location | Runs on edge, near the user |
| Setup takes time (Docker, nginx, etc.) | One command deploy |

## Architecture

```
Browser (index.html UI)
   |  POST /api/analyze  {number, code, language}
   v
Cloudflare Worker (src/worker.js)
   |
   |  1. number (242) -> LeetCode problems list (cached 24h) -> slug "valid-anagram"
   |  2. slug -> LeetCode GraphQL -> full problem (title, tags, examples, constraints)
   |  3. problem + code + system prompt -> Gemini API (key from secret)
   |  4. JSON response sanitized and sent back
   v
Browser renders the analysis
```

## Tech Stack

- Cloudflare Workers (free tier) - hosting + API
- Google Gemini `gemini-2.5-flash` (free) - AI analysis
- LeetCode public APIs (problems list + GraphQL) - problem data
- Vanilla HTML/CSS/JS - frontend (no frameworks, no build step)

## Run Locally

```bash
cd lc-analyzer
npx wrangler dev
```

For local development the Gemini key goes in a `.dev.vars` file (gitignored):

```
GEMINI_API_KEY=your-key-here
```

## Deploy

```bash
npx wrangler deploy
echo "your-gemini-key" | npx wrangler secret put GEMINI_API_KEY
```

To use a different Gemini model:

```bash
echo "gemini-2.5-pro" | npx wrangler secret put GEMINI_MODEL
```

## Project Structure

```
lc-analyzer/
├── public/
│   └── index.html      # Frontend UI
├── src/
│   └── worker.js       # Cloudflare Worker + API + AI prompt
├── wrangler.toml       # Worker config
└── .gitignore
```

## API Key Security

- The Gemini key is stored as a Cloudflare secret, never in the frontend code
- The browser only talks to the Worker; the Worker talks to Gemini with the key
- `GEMINI_API_KEY` and `GEMINI_MODEL` are configured server-side only
