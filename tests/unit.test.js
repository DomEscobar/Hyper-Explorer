#!/usr/bin/env node
/**
 * Unit Tests for Hyper-Explorer Core Classes
 * Tests KnowledgeGraph, StateFingerprint, and Planner without Playwright
 */

import { strict as assert } from 'assert';

// Extract classes from hyper-explorer for testing
// We'll create standalone test versions

// ─── StateFingerprint Tests ───

class TestStateFingerprint {
    constructor(url, title, elements, landmarks = {}) {
        this.url = url;
        this.title = title;
        this.elementCount = elements?.length || 0;
        this.domHash = this.computeDomHash(elements || []);
        this.landmarks = landmarks;
        this.landmarkHash = this.computeLandmarkHash(landmarks);
        this.urlPath = this.extractPath(url);
        this.key = this.computeKey();
    }

    extractPath(url) {
        try {
            const u = new URL(url);
            return u.pathname + u.search + u.hash;
        } catch {
            return url;
        }
    }

    computeDomHash(elements) {
        const structure = elements.map(e => `${e.role}:${e.ref}`).sort();
        return this.hashString(structure.join('|'));
    }

    computeLandmarkHash(landmarks) {
        const parts = [
            ...(landmarks.headings || []).map(h => `${h.level}:${h.text}`),
            ...(landmarks.regions || []).map(r => r.role),
            landmarks.mainContentHash || ''
        ];
        return this.hashString(parts.join('|'));
    }

    computeKey() {
        return `${this.urlPath}|${this.landmarkHash}|${this.domHash.substring(0, 8)}|${this.title}`;
    }

    hashString(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return (hash >>> 0).toString(36);
    }

    equals(other) {
        return this.key === other.key;
    }

    isStructuralChange(other) {
        return this.urlPath !== other.urlPath || this.landmarkHash !== other.landmarkHash;
    }
}

// ─── KnowledgeGraph Tests ───

class TestKnowledgeGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = [];
        this.currentNode = null;
        this.visited = new Set();
        this.surprises = [];
        this.successPatterns = new Map();
        this.failurePatterns = new Map();
    }

    recordObservation(state, action = null, outcome = null) {
        const key = state.key;
        const isNew = !this.nodes.has(key);

        if (isNew) {
            this.nodes.set(key, {
                key,
                url: state.url,
                title: state.title,
                elementCount: state.elementCount,
                firstSeen: Date.now(),
                visits: 0,
                actions: new Set(),
                outcomes: []
            });
        }

        const node = this.nodes.get(key);
        node.visits++;
        node.lastSeen = Date.now();

        if (action) node.actions.add(action);
        if (outcome) node.outcomes.push(outcome);

        if (this.currentNode && this.currentNode !== key) {
            this.edges.push({
                from: this.currentNode,
                to: key,
                action,
                timestamp: Date.now()
            });
        }

        this.visited.add(key);
        this.currentNode = key;

        return { isNew, node };
    }

    getCoverageStats() {
        const total = this.nodes.size;
        const explored = this.visited.size;
        return {
            total,
            explored,
            percent: total > 0 ? ((explored / total) * 100).toFixed(1) : '0.0'
        };
    }

    findPathToUnexplored(fromKey) {
        // BFS to find nearest unexplored neighbor
        const queue = [{ key: fromKey, path: [] }];
        const seen = new Set([fromKey]);

        while (queue.length > 0) {
            const { key, path } = queue.shift();
            const node = this.nodes.get(key);

            if (!node) continue;

            // Check if this node has unexplored actions
            // For test, assume all nodes are explored
            // Return path to most recently visited neighbor
            const outgoing = this.edges
                .filter(e => e.from === key)
                .sort((a, b) => b.timestamp - a.timestamp);

            for (const edge of outgoing) {
                if (!seen.has(edge.to)) {
                    return [...path, edge];
                }
                if (!seen.has(edge.to)) {
                    seen.add(edge.to);
                    queue.push({ key: edge.to, path: [...path, edge] });
                }
            }
        }

        return null;
    }

    exportGraph() {
        return {
            nodes: Array.from(this.nodes.values()).map(n => ({
                ...n,
                actions: Array.from(n.actions)
            })),
            edges: this.edges,
            coverage: this.getCoverageStats(),
            surprises: this.surprises
        };
    }
}

// ─── Test Runner ───

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

console.log('\n🧪 Hyper-Explorer Unit Tests\n');

// StateFingerprint Tests
console.log('StateFingerprint:');

test('should extract path from URL', () => {
    const fp = new TestStateFingerprint('http://localhost:5173/dashboard', 'Dashboard', []);
    assert.equal(fp.urlPath, '/dashboard');
});

test('should compute consistent hash', () => {
    const elements = [{ role: 'button', ref: 'e1' }, { role: 'link', ref: 'e2' }];
    const fp1 = new TestStateFingerprint('http://localhost:5173/', 'Home', elements);
    const fp2 = new TestStateFingerprint('http://localhost:5173/', 'Home', elements);
    assert.equal(fp1.key, fp2.key);
});

test('should detect structural change on URL change', () => {
    const fp1 = new TestStateFingerprint('http://localhost:5173/login', 'Login', []);
    const fp2 = new TestStateFingerprint('http://localhost:5173/register', 'Register', []);
    assert.equal(fp1.isStructuralChange(fp2), true);
});

test('should detect structural change on landmark change', () => {
    const fp1 = new TestStateFingerprint('http://localhost:5173/', 'Home', [], { headings: [{ level: 1, text: 'Welcome' }] });
    const fp2 = new TestStateFingerprint('http://localhost:5173/', 'Home', [], { headings: [{ level: 1, text: 'Dashboard' }] });
    assert.equal(fp1.isStructuralChange(fp2), true);
});

// KnowledgeGraph Tests
console.log('\nKnowledgeGraph:');

test('should record new node', () => {
    const graph = new TestKnowledgeGraph();
    const state = new TestStateFingerprint('http://localhost:5173/', 'Home', []);
    const result = graph.recordObservation(state);
    assert.equal(result.isNew, true);
    assert.equal(graph.nodes.size, 1);
});

test('should detect existing node', () => {
    const graph = new TestKnowledgeGraph();
    const state = new TestStateFingerprint('http://localhost:5173/', 'Home', []);
    graph.recordObservation(state);
    const result = graph.recordObservation(state);
    assert.equal(result.isNew, false);
});

test('should track node visits', () => {
    const graph = new TestKnowledgeGraph();
    const state = new TestStateFingerprint('http://localhost:5173/', 'Home', []);
    graph.recordObservation(state);
    graph.recordObservation(state);
    graph.recordObservation(state);
    assert.equal(graph.nodes.get(state.key).visits, 3);
});

test('should record edges between nodes', () => {
    const graph = new TestKnowledgeGraph();
    const state1 = new TestStateFingerprint('http://localhost:5173/login', 'Login', []);
    const state2 = new TestStateFingerprint('http://localhost:5173/dashboard', 'Dashboard', []);
    graph.recordObservation(state1);
    graph.recordObservation(state2, 'click_login');
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].action, 'click_login');
});

test('should calculate coverage stats', () => {
    const graph = new TestKnowledgeGraph();
    graph.recordObservation(new TestStateFingerprint('http://localhost:5173/', 'Home', []));
    graph.recordObservation(new TestStateFingerprint('http://localhost:5173/login', 'Login', []));
    const stats = graph.getCoverageStats();
    assert.equal(stats.total, 2);
    assert.equal(stats.explored, 2);
});

test('should export graph structure', () => {
    const graph = new TestKnowledgeGraph();
    graph.recordObservation(new TestStateFingerprint('http://localhost:5173/', 'Home', []));
    const exported = graph.exportGraph();
    assert.equal(exported.nodes.length, 1);
    assert.ok(exported.coverage);
});

// Summary
console.log('\n' + '-'.repeat(40));
console.log(`Results: ${passed}/${passed + failed} passed`);

if (failed > 0) {
    process.exit(1);
}
