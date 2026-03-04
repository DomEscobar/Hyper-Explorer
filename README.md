# Hyper-Explorer

Goal-directed autonomous web exploration agent. Works against **any web app**: point it at a URL and optional goals; it builds a knowledge graph, replans on stuck, and can write findings for integration with the Agency finding watcher.

## Quick Start

From this repo:

```bash
npm install
# Single goal (default: explore_max_coverage)
node src/hyper-explorer-mcp.mjs <APP_URL>

# Specific goals
node src/hyper-explorer-mcp.mjs <APP_URL> login complete_registration

# With app codebase for smarter planning (optional)
node src/hyper-explorer-mcp.mjs <APP_URL> --app-root /path/to/your/app

# All journeys from user-journey.md
node src/hyper-explorer-mcp.mjs <APP_URL> --journeys

# Custom journey file
node src/hyper-explorer-mcp.mjs <APP_URL> --journeys --journeys-file /path/to/journeys.md
```

Replace `<APP_URL>` with any reachable origin (e.g. `http://localhost:3000`, `https://app.example.com`). Goals are strings you define; the planner decomposes them into subtasks.

## AGENCY_HOME (opencode integration)

When run from the **opencode** repo (e.g. via `run-explore-and-watch.cjs`), set `AGENCY_HOME` to the opencode root so that:

- Findings are written to `AGENCY_HOME/roster/player/memory/findings.md` for the player-finding-watcher.
- Telegram config is read from `AGENCY_HOME/config.json` if present.

Example (opencode calling this repo): `AGENCY_HOME=/path/to/opencode node /path/to/Hyper-Explorer/src/hyper-explorer-mcp.mjs <APP_URL>`

Standalone: leave `AGENCY_HOME` unset; findings are written only when `AGENCY_HOME` is set; use `config.json` in this repo or env vars for Telegram.

## Config

No hardcoded absolute paths. Configuration:

- **config.json** (repo root, or `AGENCY_HOME/config.json` when `AGENCY_HOME` is set): optional. Keys: `defaultUrl` or `startUrl`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- **Env**: `EXPLORER_URL`, `EXPLORER_DEFAULT_URL`, `AGENCY_HOME`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- **CLI**: First argument can be an app URL (`http...`) or a goal; if omitted or not URL-like, default URL comes from config/env.

## Structure

```
Hyper-Explorer/
├── src/
│   ├── hyper-explorer-mcp.mjs  # Main entry (MCP + Playwright)
│   ├── config.mjs              # Config loader (repo root / AGENCY_HOME, no hardcoded paths)
│   ├── codebase-tools.mjs      # grep/listDir/readFile for --app-root
│   ├── explorer-llm.mjs        # LLM plan decomposition (optional)
│   └── telemetry.mjs           # Optional Telegram reporting
├── user-journey.md             # Optional: goal definitions for --journeys
├── memory/                     # Generated state (gitignored)
│   ├── credentials.json        # Optional: saved login credentials
│   ├── knowledge_graph.json    # Page graph
│   ├── plan_trace.jsonl        # Planning decisions
│   └── execution_log.jsonl     # Action trace
├── explore.js                  # CLI wrapper
├── run-flow.js                 # Multi-goal orchestrator
└── package.json
```

## How It Works

1. **Target**: Any web app URL. No app-specific code; the explorer uses a browser (Playwright via MCP) and structural navigation (landmarks, content hashes).
2. **Goals**: Free-form strings (e.g. `login`, `checkout`, `explore_max_coverage`). The planner turns them into subtasks; you can define journeys in `user-journey.md` and load them with `--journeys`.
3. **Execution**: Observe → Decide → Act. Clicks and navigation update a knowledge graph; replanning runs when the agent gets stuck (no structural change after several steps).
4. **Output**: Findings (goal failures, console issues) can be appended to an Agency findings file when `AGENCY_HOME` is set; otherwise see logs and `memory/`.

## Integration with Agency (opencode)

- **Findings path**: When `AGENCY_HOME` is set, findings go to `AGENCY_HOME/roster/player/memory/findings.md`. The watcher polls this file and spawns the Agency for each new finding.
- **Run explorer then watcher**: From opencode root, ensure scripts point at this repo and run `node run-explore-and-watch.cjs <APP_URL> [goals...]` (or `--journeys` / `--yolo`).

## Optional: Auth and Telegram

- **Login flows**: For apps that require auth, add `memory/credentials.json` with `email`, `password`, and optional `name` so the explorer can reuse credentials across runs.
- **Telemetry**: Put `config.json` in this repo root (or set `AGENCY_HOME` to opencode to use its config) with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`; or use env vars. `telemetry.mjs` will report runs and results.

## npm Scripts

From this repo root:

```bash
npm run explore          # Default URL from config/env, single goal
npm run flow             # run-flow.js: multiple goals in sequence
npm run register         # Goal: register_new_user_complete_flow (example)
npm run login            # Goal: login_existing_user_successful_login (example)
npm test                 # Unit, smoke, integration tests
```

Set `EXPLORER_URL` or `defaultUrl` in config; or pass URL as first argument.

## Example: real-world tests and benchmarks

See **example/** for a runnable test suite and benchmarks (config-driven, no hardcoded paths):

- **Real-world tests**: `npm run example:suite` or `node example/real-world-tests/run-suite.mjs` — runs goals from `example/real-world-tests/goals.json`, reports pass/fail and optional metrics (steps, replans, nodes).
- **Benchmarks**: `npm run example:benchmark` or `node example/benchmarks/run-benchmark.mjs` — runs against **public web apps** (youtube.com, the-internet.herokuapp.com, wikipedia.org) by default; measures duration, steps, replans, graph size per goal; optional `--output results.json`. Use `--config example/benchmarks/benchmark-local.json` and `EXPLORER_URL` for a local app.
