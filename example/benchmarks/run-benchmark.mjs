#!/usr/bin/env node
/**
 * Benchmark: run explorer for configured goals and collect metrics.
 * Reads memory/plan_trace.jsonl, execution_log.jsonl, knowledge_graph.json after each run.
 * Uses EXPLORER_URL or config defaultUrl. No hardcoded paths.
 *
 * Usage:
 *   node example/benchmarks/run-benchmark.mjs
 *   node example/benchmarks/run-benchmark.mjs --goal explore_max_coverage --runs 2
 *   node example/benchmarks/run-benchmark.mjs --config example/benchmarks/benchmark-config.json --output results.json
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const HYPER = path.join(REPO_ROOT, 'src', 'hyper-explorer-mcp.mjs');
const MEMORY_DIR = path.join(REPO_ROOT, 'memory');
const DEFAULT_CONFIG = path.join(__dirname, 'benchmark-public.json');

async function getDefaultUrl() {
    try {
        const { getConfig } = await import(path.join(REPO_ROOT, 'src', 'config.mjs'));
        return getConfig().defaultUrl;
    } catch {
        return process.env.EXPLORER_URL || 'http://localhost:5173';
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    let configFile = DEFAULT_CONFIG;
    let singleGoal = null;
    let runs = null;
    let outputFile = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config' && args[i + 1]) {
            configFile = path.resolve(process.cwd(), args[i + 1]);
            i++;
        } else if (args[i] === '--goal' && args[i + 1]) {
            singleGoal = args[i + 1];
            i++;
        } else if (args[i] === '--runs' && args[i + 1]) {
            runs = parseInt(args[i + 1], 10) || 1;
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputFile = path.resolve(process.cwd(), args[i + 1]);
            i++;
        }
    }
    return { configFile, singleGoal, runs, outputFile };
}

function loadConfig(configFile) {
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (Array.isArray(raw.targets) && raw.targets.length > 0) {
        return {
            targets: raw.targets.map((t) => ({
                name: t.name || new URL(t.url).hostname,
                url: t.url,
                goals: Array.isArray(t.goals) ? t.goals : [t.goal].filter(Boolean)
            })),
            runsPerGoal: raw.runsPerGoal ?? 1
        };
    }
    return {
        targets: null,
        goals: Array.isArray(raw.goals) ? raw.goals : [raw.goal].filter(Boolean),
        runsPerGoal: raw.runsPerGoal ?? 1
    };
}

function readMetricFile(filePath, parser) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const content = fs.readFileSync(filePath, 'utf8');
        return parser(content);
    } catch {
        return null;
    }
}

function countExecutionSteps(filePath) {
    return readMetricFile(filePath, (c) => c.trim().split('\n').filter(Boolean).length);
}

function countReplans(filePath) {
    return readMetricFile(filePath, (c) => {
        return c.trim().split('\n').filter((line) => {
            try {
                const o = JSON.parse(line);
                return o.event === 'replan';
            } catch {
                return false;
            }
        }).length;
    });
}

function countPlanEvents(filePath) {
    return readMetricFile(filePath, (c) => {
        return c.trim().split('\n').filter((line) => {
            try {
                const o = JSON.parse(line);
                return o.event === 'plan_generated' || o.event === 'replan';
            } catch {
                return false;
            }
        }).length;
    });
}

function getGraphStats(filePath) {
    return readMetricFile(filePath, (c) => {
        try {
            const g = JSON.parse(c);
            const nodes = (g.nodes && g.nodes.length) || 0;
            const edges = (g.edges && g.edges.length) || 0;
            return { nodes, edges };
        } catch {
            return { nodes: 0, edges: 0 };
        }
    });
}

function clearRunArtifacts(memoryDir) {
    const files = ['execution_log.jsonl', 'plan_trace.jsonl', 'knowledge_graph.json'];
    for (const f of files) {
        const p = path.join(memoryDir, f);
        try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch (_) {}
    }
}

async function runOne(url, goal) {
    clearRunArtifacts(MEMORY_DIR);
    const start = Date.now();
    const proc = spawn('node', [HYPER, url, goal], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    proc.stdout?.on('data', (d) => { stdout += d; });
    const code = await new Promise((resolve) => proc.on('close', resolve));
    const durationMs = Date.now() - start;

    const steps = countExecutionSteps(path.join(MEMORY_DIR, 'execution_log.jsonl'));
    const replans = countReplans(path.join(MEMORY_DIR, 'plan_trace.jsonl'));
    const planEvents = countPlanEvents(path.join(MEMORY_DIR, 'plan_trace.jsonl'));
    const graph = getGraphStats(path.join(MEMORY_DIR, 'knowledge_graph.json')) || { nodes: 0, edges: 0 };

    return {
        success: code === 0,
        exitCode: code,
        durationMs,
        steps: steps ?? 0,
        replans: replans ?? 0,
        planEvents: planEvents ?? 0,
        nodes: graph.nodes,
        edges: graph.edges
    };
}

function aggregate(runs) {
    if (!runs.length) return null;
    const durations = runs.map((r) => r.durationMs);
    const steps = runs.map((r) => r.steps);
    return {
        runs: runs.length,
        successCount: runs.filter((r) => r.success).length,
        durationMsMin: Math.min(...durations),
        durationMsMax: Math.max(...durations),
        durationMsAvg: durations.reduce((a, b) => a + b, 0) / durations.length,
        stepsAvg: steps.reduce((a, b) => a + b, 0) / steps.length,
        stepsMax: Math.max(...steps),
        replansAvg: runs.reduce((a, r) => a + r.replans, 0) / runs.length,
        nodesMax: Math.max(...runs.map((r) => r.nodes))
    };
}

function formatTable(goalResults, showTarget = false) {
    const headers = showTarget ? ['Target', 'Goal', 'Runs', 'OK', 'Duration (s)', 'Steps', 'Replans', 'Nodes'] : ['Goal', 'Runs', 'OK', 'Duration (s)', 'Steps', 'Replans', 'Nodes'];
    const rows = [headers, headers.map((_, i) => (i < 2 ? '─'.repeat(12) : '─'))];
    for (const { targetName, goal, agg, runs } of goalResults) {
        if (!agg) continue;
        const goalLabel = (goal || '').slice(0, 22);
        const cells = showTarget
            ? [
                (targetName || '').slice(0, 14),
                goalLabel,
                String(agg.runs),
                `${agg.successCount}/${agg.runs}`,
                `${(agg.durationMsAvg / 1000).toFixed(1)} (${(agg.durationMsMin / 1000).toFixed(1)}–${(agg.durationMsMax / 1000).toFixed(1)})`,
                agg.stepsAvg.toFixed(0),
                agg.replansAvg.toFixed(1),
                String(agg.nodesMax)
            ]
            : [
                goalLabel,
                String(agg.runs),
                `${agg.successCount}/${agg.runs}`,
                `${(agg.durationMsAvg / 1000).toFixed(1)} (${(agg.durationMsMin / 1000).toFixed(1)}–${(agg.durationMsMax / 1000).toFixed(1)})`,
                agg.stepsAvg.toFixed(0),
                agg.replansAvg.toFixed(1),
                String(agg.nodesMax)
            ];
        rows.push(cells);
    }
    const colWidths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length), 4));
    return rows.map((row) => row.map((cell, i) => String(cell).padEnd(colWidths[i])).join('  ')).join('\n');
}

async function main() {
    const { configFile, singleGoal, runs: runsArg, outputFile } = parseArgs();
    const defaultUrl = await getDefaultUrl();

    let targets = null;
    let runsPerGoal = runsArg ?? 1;

    if (singleGoal) {
        const url = process.env.EXPLORER_URL || defaultUrl;
        targets = [{ name: new URL(url).hostname, url, goals: [singleGoal] }];
    } else {
        if (!fs.existsSync(configFile)) {
            console.error('Config not found:', configFile);
            process.exit(2);
        }
        const cfg = loadConfig(configFile);
        runsPerGoal = runsArg ?? cfg.runsPerGoal;
        if (cfg.targets) {
            targets = cfg.targets;
        } else {
            const url = process.env.EXPLORER_URL || defaultUrl;
            targets = [{ name: new URL(url).hostname, url, goals: cfg.goals }];
        }
    }

    console.log('\nBenchmark');
    console.log('Targets:', targets.map((t) => `${t.name} (${t.goals.length} goal(s))`).join(' | '));
    console.log('Runs per goal:', runsPerGoal);
    console.log('');

    const allGoalResults = [];
    const summaryTargets = [];

    for (const target of targets) {
        if (!target.goals || target.goals.length === 0) continue;
        const goalResults = [];
        for (const goal of target.goals) {
            const runs = [];
            for (let r = 0; r < runsPerGoal; r++) {
                process.stdout.write(`  ${target.name} / ${goal} run ${r + 1}/${runsPerGoal} ... `);
                const result = await runOne(target.url, goal);
                runs.push(result);
                console.log(`${(result.durationMs / 1000).toFixed(1)}s  steps=${result.steps}  replans=${result.replans}  nodes=${result.nodes}`);
                if (r < runsPerGoal - 1) {
                    await new Promise((res) => setTimeout(res, 2000));
                }
            }
            const agg = aggregate(runs);
            goalResults.push({ targetName: target.name, goal, runs, agg });
            allGoalResults.push({ targetName: target.name, goal, runs, agg });
        }
        summaryTargets.push({ name: target.name, url: target.url, goalResults: goalResults.map(({ goal, agg, runs }) => ({ goal, ...agg, raw: runs })) });
    }

    if (!allGoalResults.length) {
        console.error('No goals to benchmark');
        process.exit(2);
    }

    const showTarget = targets.length > 1 || (targets.length === 1 && targets[0].goals.length > 1) || allGoalResults.some((r) => r.targetName !== allGoalResults[0].targetName);
    const totalRuns = allGoalResults.reduce((s, r) => s + (r.agg ? r.agg.runs : 0), 0);
    console.log(`\nResults (${totalRuns} run(s)):`);
    console.log('\n' + formatTable(allGoalResults, showTarget));

    const summary = {
        timestamp: new Date().toISOString(),
        runsPerGoal,
        targets: summaryTargets
    };

    if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2));
        console.log('\nWritten:', outputFile);
    }

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});
