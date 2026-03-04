/**
 * Explorer LLM client: goal decomposition with optional codebase query.
 * Uses OpenRouter. When appRoot is set, LLM can return codebaseQuery; we run it and pass results back for subtasks.
 * Config/API key: from config.mjs (repo or AGENCY_HOME config.json) or OPENROUTER_API_KEY env.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUBTASK_TYPES = [
    'find_auth_page', 'fill_form', 'submit', 'verify_success', 'verify_dashboard',
    'maximize_coverage', 'explore_depth', 'backtrack', 'try_alternative_path', 'find_frontier', 'recover'
];

function getApiKey() {
    return getConfig().openRouterApiKey || null;
}

export async function callLLM(messages, maxTokens = 300) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: process.env.EXPLORER_LLM_MODEL || 'openrouter/stepfun/step-3.5-flash',
            messages,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' }
        })
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}`);
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '{}').trim();
}

function parseJson(text) {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleaned);
}

function fallbackSubtasks(goal) {
    if (goal.includes('register') || goal.includes('signup')) {
        return [
            { type: 'find_auth_page', intent: 'Locate registration entry point' },
            { type: 'fill_form', intent: 'Complete registration fields' },
            { type: 'submit', intent: 'Submit registration' },
            { type: 'verify_success', intent: 'Confirm successful registration' }
        ];
    }
    if (goal.includes('login') || goal.includes('signin')) {
        return [
            { type: 'find_auth_page', intent: 'Locate login form' },
            { type: 'fill_form', intent: 'Enter credentials' },
            { type: 'submit', intent: 'Submit login' },
            { type: 'verify_dashboard', intent: 'Confirm logged-in state' }
        ];
    }
    if (goal.includes('explore') || goal.includes('discover') || goal.includes('coverage')) {
        return [{ type: 'maximize_coverage', intent: 'Explore all reachable states' }];
    }
    return [{ type: 'explore_depth', intent: `Explore deeply: ${goal}`, depth: 5 }];
}

/**
 * Decompose goal into subtasks. When codebaseAvailable and no codebaseResults,
 * LLM may return codebaseQuery. When codebaseResults is provided, LLM returns subtasks.
 * @returns {{ subtasks: Array<{type, intent}>, codebaseQuery?: Array<{op, pattern?, path?}> }}
 */
export async function decomposeGoal(goal, stateSummary, opts = {}) {
    const { codebaseAvailable = false, codebaseResults = null } = opts;
    const stateStr = stateSummary
        ? `Current URL/path: ${stateSummary.urlPath || stateSummary.url || 'unknown'}, title: ${stateSummary.title || 'unknown'}.`
        : 'No current state.';

    if (codebaseResults !== null && codebaseResults !== undefined) {
        const prompt = `You have codebase search results below. Use them to plan how to achieve the goal.
Goal: ${goal}
${stateStr}

Codebase results:
${typeof codebaseResults === 'string' ? codebaseResults : JSON.stringify(codebaseResults, null, 1).slice(0, 4000)}

Return a JSON object with one key: "subtasks" — an array of objects with "type" and "intent".
Each type must be one of: ${SUBTASK_TYPES.join(', ')}.
Example: {"subtasks":[{"type":"find_auth_page","intent":"Find login or signup link"},{"type":"fill_form","intent":"Enter credentials"}]}`;
        try {
            const text = await callLLM([{ role: 'user', content: prompt }], 400);
            const out = parseJson(text);
            const subtasks = Array.isArray(out.subtasks) ? out.subtasks : [];
            const valid = subtasks.filter(s => SUBTASK_TYPES.includes(s.type)).map(s => ({ type: s.type, intent: s.intent || s.type }));
            return { subtasks: valid.length ? valid : fallbackSubtasks(goal) };
        } catch (e) {
            return { subtasks: fallbackSubtasks(goal) };
        }
    }

    if (codebaseAvailable) {
        const prompt = `Plan how to achieve this exploration goal. You may optionally request codebase searches to plan better.

Goal: ${goal}
${stateStr}

If you want to look at the app codebase first, return a JSON object with key "codebaseQuery": an array of operations. Each operation: {"op":"grep","pattern":"..."} or {"op":"listDir","path":"frontend/src"} or {"op":"readFile","path":"path/to/file.js"}. Use path relative to app root. Limit to 1-4 operations.
If you do NOT need codebase, return only "subtasks": array of objects with "type" and "intent". Each type must be one of: ${SUBTASK_TYPES.join(', ')}.

Return ONLY one JSON object. Either {"codebaseQuery":[...]} or {"subtasks":[...]}.`;
        try {
            const text = await callLLM([{ role: 'user', content: prompt }], 350);
            const out = parseJson(text);
            if (Array.isArray(out.codebaseQuery) && out.codebaseQuery.length > 0) {
                return { subtasks: [], codebaseQuery: out.codebaseQuery };
            }
            const subtasks = Array.isArray(out.subtasks) ? out.subtasks : [];
            const valid = subtasks.filter(s => SUBTASK_TYPES.includes(s.type)).map(s => ({ type: s.type, intent: s.intent || s.type }));
            return { subtasks: valid.length ? valid : fallbackSubtasks(goal) };
        } catch (e) {
            return { subtasks: fallbackSubtasks(goal) };
        }
    }

    return { subtasks: fallbackSubtasks(goal) };
}
