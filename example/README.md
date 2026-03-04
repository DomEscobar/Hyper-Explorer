# Example: real-world tests and benchmarks

Runnable examples for **real-world test suites** and **benchmarks** using Hyper-Explorer. All paths and URLs are config-driven.

**Prerequisites:** From repo root run `npm install`. Benchmarks write to `memory/` (plan_trace, execution_log, knowledge_graph).

---

## Benchmarks (public web apps by default)

Benchmarks run against **public web apps** by default — no local server required.

```bash
# From repo root — runs against youtube.com, the-internet.herokuapp.com, wikipedia.org
npm run example:benchmark
# or
node example/benchmarks/run-benchmark.mjs

# Custom public config
node example/benchmarks/run-benchmark.mjs --config example/benchmarks/benchmark-public.json --output results.json

# Single goal, 2 runs (uses EXPLORER_URL or config defaultUrl for the single target)
node example/benchmarks/run-benchmark.mjs --goal explore_max_coverage --runs 2
```

- **benchmark-public.json** (default) – `targets`: list of `{ name, url, goals }` for public sites (youtube.com, the-internet.herokuapp.com, wikipedia.org). Generic goal: `explore_max_coverage`.
- **benchmark-local.json** – Single URL from `EXPLORER_URL` or config and app-specific goals (e.g. login, register); use with `--config example/benchmarks/benchmark-local.json` when you have a local app running.
- **run-benchmark.mjs** – For each target, runs the explorer per goal, parses `memory/` for steps, replans, graph size; prints a table and optional JSON.

---

## Real-world tests (local app)

Run a configurable suite of goals against **your app** (requires a running server).

```bash
EXPLORER_URL=http://localhost:5173 node example/real-world-tests/run-suite.mjs
EXPLORER_URL=http://localhost:5173 node example/real-world-tests/run-suite.mjs --goals example/real-world-tests/my-goals.json --output results.json
```

- **goals.json** – Goals to run and whether each is required (suite fails if a required goal fails).
- **run-suite.mjs** – Spawns the explorer per goal, records exit code and metrics from `memory/`, prints summary.

---

## Config

- **Benchmarks**: Default config is **benchmark-public.json** (public URLs). Override with `--config`; for single-URL mode use **benchmark-local.json** and set `EXPLORER_URL` or `defaultUrl` in config.
- **Real-world tests**: Set `EXPLORER_URL` or `defaultUrl`; goals via `--goals` or default `goals.json`.
