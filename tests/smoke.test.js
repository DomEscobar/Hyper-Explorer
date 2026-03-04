#!/usr/bin/env node
/**
 * Smoke Tests - Verify modules load and basic functionality works
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'src');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${e.message}`);
        failed++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${e.message}`);
        failed++;
    }
}

console.log('\n🔥 Hyper-Explorer Smoke Tests\n');

// Module Loading Tests
console.log('Module Loading:');

await asyncTest('telemetry module loads', async () => {
    const telemetry = await import(path.join(SRC_DIR, 'telemetry.mjs'));
    assert.ok(telemetry.default);
    assert.ok(typeof telemetry.sendTelegramMessage === 'function');
});

await asyncTest('telemetry has required exports', async () => {
    const { sendTelegramMessage, sendTelegramPhoto, reportExplorerRun, reportFlowComplete, logTelemetry } = await import(path.join(SRC_DIR, 'telemetry.mjs'));
    assert.ok(typeof sendTelegramMessage === 'function');
    assert.ok(typeof reportExplorerRun === 'function');
    assert.ok(typeof logTelemetry === 'function');
});

// File Structure Tests
console.log('\nFile Structure:');

test('hyper-explorer-mcp.mjs exists', () => {
    assert.ok(fs.existsSync(path.join(SRC_DIR, 'hyper-explorer-mcp.mjs')));
});

test('telemetry.mjs exists', () => {
    assert.ok(fs.existsSync(path.join(SRC_DIR, 'telemetry.mjs')));
});

test('memory directory exists', () => {
    const memoryDir = path.join(__dirname, '..', 'memory');
    assert.ok(fs.existsSync(memoryDir));
});

// Telemetry Tests
console.log('\nTelemetry:');

await asyncTest('logTelemetry writes to file', async () => {
    const { logTelemetry } = await import(path.join(SRC_DIR, 'telemetry.mjs'));
    const testEvent = 'test_event_' + Date.now();
    logTelemetry(testEvent, { test: true });

    const logFile = path.join(__dirname, '..', 'memory', 'telemetry.jsonl');
    assert.ok(fs.existsSync(logFile));

    const content = fs.readFileSync(logFile, 'utf8');
    assert.ok(content.includes(testEvent));
});

test('telemetry has isEnabled function', async () => {
    const telemetry = await import(path.join(SRC_DIR, 'telemetry.mjs'));
    assert.ok(typeof telemetry.default.isEnabled === 'function');
});

// Configuration Tests
console.log('\nConfiguration:');

test('package.json is valid JSON', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.ok(pkg.name);
    assert.ok(pkg.scripts);
});

test('package.json has required scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.explore);
    assert.ok(pkg.scripts.flow);
    assert.ok(pkg.scripts.test);
    assert.ok(pkg.scripts.register);
});

test('README.md exists', () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'README.md')));
});

// Summary
console.log('\n' + '-'.repeat(40));
console.log(`Results: ${passed}/${passed + failed} passed`);

if (failed > 0) {
    process.exit(1);
}
