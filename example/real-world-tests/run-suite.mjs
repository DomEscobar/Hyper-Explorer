#!/usr/bin/env node
/**
 * Real-world test suite: run a set of goals and report pass/fail.
 * Uses EXPLORER_URL or config defaultUrl. No hardcoded paths.
 *
 * Usage:
 *   node example/real-world-tests/run-suite.mjs
 *   node example/real-world-tests/run-suite.mjs --goals example/real-world-tests/goals.json --output results.json
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');
const HYPER = path.join(REPO_ROOT, 'src', 'hyper-explorer-mcp.mjs');
const MEMORY_DIR = path.join(REPO_ROOT, 'memory');
const DEFAULT_GOALS_FILE = path.join(__dirname, 'goals.json');

async function loadConfig() {
    try {
        const { getConfig } = await import(path.join(REPO_ROOT, 'src', 'config.mjs'));
        return getConfig().defaultUrl;
    } catch {
        return process.env.EXPLORER_URL || 'http://localhost:5173';
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    let goalsFile = DEFAULT_GOALS_FILE;
    let outputFile = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--goals' && args[i + 1]) {
            goalsFile = path.resolve(process.cwd(), args[i + 1]);
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputFile = path.resolve(process.cwd(), args[i + 1]);
            i++;
        }
    }
    return { goalsFile, outputFile };
}

function loadGoals(goalsFile) {
    const raw = JSON.parse(fs.readFileSync(goalsFile, 'utf8'));
    return Array.isArray(raw.goals) ? raw.goals : raw;
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

function countLines(filePath) {
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

function getGraphNodes(filePath) {
    return readMetricFile(filePath, (c) => {
        try {
            const g = JSON.parse(c);
            return (g.nodes && g.nodes.length) || 0;
        } catch {
            return 0;
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

async function runGoal(url, goalSpec, memoryDir) {
    clearRunArtifacts(memoryDir);
    const start = Date.now();
    const proc = spawn('node', [HYPER, url, goalSpec.goal], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => { stdout += d; });
    proc.stderr?.on('data', (d) => { stderr += d; });

    const code = await new Promise((resolve) => proc.on('close', resolve));
    const durationMs = Date.now() - start;
    const success = code === 0;

    const steps = countLines(path.join(memoryDir, 'execution_log.jsonl'));
    const replans = countReplans(path.join(memoryDir, 'plan_trace.jsonl'));
    const nodes = getGraphNodes(path.join(memoryDir, 'knowledge_graph.json'));

    return {
        id: goalSpec.id || goalSpec.goal,
        goal: goalSpec.goal,
        required: goalSpec.required !== false,
        success,
        exitCode: code,
        durationMs,
        steps: steps ?? undefined,
        replans: replans ?? undefined,
        nodes: nodes ?? undefined
    };
}

async function main() {
    const { goalsFile, outputFile } = parseArgs();
    const url = process.env.EXPLORER_URL || (await loadConfig());

    if (!fs.existsSync(goalsFile)) {
        console.error('Goals file not found:', goalsFile);
        process.exit(2);
    }

    const goals = loadGoals(goalsFile);
    if (!goals.length) {
        console.error('No goals in', goalsFile);
        process.exit(2);
    }

    console.log('\nReal-world test suite');
    console.log('URL:', url);
    console.log('Goals:', goals.length);
    console.log('');

    const results = [];
    for (let i = 0; i < goals.length; i++) {
        const g = goals[i];
        console.log(`  [${i + 1}/${goals.length}] ${g.id || g.goal} ...`);
        const r = await runGoal(url, g, MEMORY_DIR);
        results.push(r);
        console.log(`        ${r.success ? '✅ PASS' : '❌ FAIL'}  ${(r.durationMs / 1000).toFixed(1)}s  ${r.steps != null ? `steps=${r.steps}` : ''} ${r.replans != null ? `replans=${r.replans}` : ''}`);
        if (i < goals.length - 1) {
            await new Promise((r) => setTimeout(r, 3000));
        }
    }

    const required = results.filter((r) => r.required);
    const failedRequired = required.filter((r) => !r.success);
    const passed = results.filter((r) => r.success).length;

    console.log('\n' + '─'.repeat(50));
    console.log(`Result: ${passed}/${results.length} passed`);
    if (failedRequired.length) {
        console.log(`Failed required: ${failedRequired.map((r) => r.id || r.goal).join(', ')}`);
    }
    console.log('');

    if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify({ url, results, passed: results.length - failedRequired.length, total: results.length }, null, 2));
        console.log('Written:', outputFile);
    }

    process.exit(failedRequired.length > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});
