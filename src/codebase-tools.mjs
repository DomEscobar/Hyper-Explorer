/**
 * Codebase tools for explorer-decided search: grep, listDir, readFile.
 * Used only when the explorer's LLM requests specific operations.
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_MAX_GREP_MATCHES = 30;
const DEFAULT_MAX_FILE_CHARS = 8000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'vendor']);

function walkDir(appRoot, dir, fileList = [], opts = {}) {
    const maxFiles = opts.maxFiles ?? 500;
    if (fileList.length >= maxFiles) return fileList;
    let entries;
    try {
        entries = fs.readdirSync(path.join(appRoot, dir), { withFileTypes: true });
    } catch {
        return fileList;
    }
    for (const e of entries) {
        if (fileList.length >= maxFiles) break;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            walkDir(appRoot, rel, fileList, opts);
        } else if (e.isFile()) {
            const ext = path.extname(e.name).toLowerCase();
            if (opts.extensions && !opts.extensions.includes(ext)) continue;
            fileList.push(rel);
        }
    }
    return fileList;
}

export function listDir(appRoot, relativePath = '') {
    const full = path.resolve(appRoot, relativePath);
    if (!full.startsWith(path.resolve(appRoot))) return { error: 'Path escapes app root' };
    try {
        const entries = fs.readdirSync(full, { withFileTypes: true });
        return {
            path: relativePath || '.',
            entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }))
        };
    } catch (e) {
        return { error: e.message };
    }
}

export function readFile(appRoot, relativePath, maxChars = DEFAULT_MAX_FILE_CHARS) {
    const full = path.resolve(appRoot, relativePath);
    if (!full.startsWith(path.resolve(appRoot))) return { error: 'Path escapes app root' };
    try {
        const content = fs.readFileSync(full, 'utf8');
        const truncated = content.length > maxChars;
        return {
            path: relativePath,
            content: content.slice(0, maxChars),
            truncated: truncated,
            totalChars: content.length
        };
    } catch (e) {
        return { error: e.message };
    }
}

export function grep(appRoot, pattern, opts = {}) {
    const maxMatches = opts.maxMatches ?? DEFAULT_MAX_GREP_MATCHES;
    const extensions = opts.extensions ?? ['.js', '.ts', '.jsx', '.tsx', '.vue', '.mjs', '.cjs', '.json'];
    const patternStr = typeof pattern === 'string' ? pattern : (pattern?.pattern ?? String(pattern));
    let regex;
    try {
        regex = new RegExp(patternStr, 'gi');
    } catch {
        regex = new RegExp(escapeRe(patternStr), 'gi');
    }
    const results = [];
    const files = walkDir(appRoot, '', [], { maxFiles: 200, extensions });
    for (const rel of files) {
        if (results.length >= maxMatches) break;
        try {
            const full = path.join(appRoot, rel);
            const content = fs.readFileSync(full, 'utf8');
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
                if (regex.test(lines[i])) {
                    results.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) });
                }
            }
        } catch {
            // skip binary or unreadable
        }
    }
    return { pattern: patternStr, matches: results };
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function runCodebaseQuery(appRoot, codebaseQuery) {
    if (!Array.isArray(codebaseQuery) || codebaseQuery.length === 0) return [];
    const output = [];
    for (const q of codebaseQuery) {
        const op = q.op || q.operation;
        if (op === 'grep') {
            const res = grep(appRoot, q.pattern || q.search, { maxMatches: q.maxMatches ?? 20 });
            output.push({ op: 'grep', request: q.pattern || q.search, ...res });
        } else if (op === 'listDir') {
            const res = listDir(appRoot, q.path || q.relativePath || '');
            output.push({ op: 'listDir', request: q.path || '', ...res });
        } else if (op === 'readFile') {
            const res = readFile(appRoot, q.path || q.relativePath, q.maxChars);
            output.push({ op: 'readFile', request: q.path || '', ...res });
        }
    }
    return output;
}
