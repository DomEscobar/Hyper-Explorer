/**
 * Single place for config paths and defaults. No hardcoded absolute paths.
 * Config file: repo root config.json, or AGENCY_HOME/config.json when AGENCY_HOME is set (overrides).
 * Env overrides: EXPLORER_URL, EXPLORER_DEFAULT_URL, AGENCY_HOME, OPENROUTER_API_KEY, etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const DEFAULT_URL_FALLBACK = 'http://localhost:5173';

let cached = null;

function loadRaw() {
    const fromRepo = path.join(REPO_ROOT, 'config.json');
    let merged = {};
    try {
        if (fs.existsSync(fromRepo)) {
            merged = JSON.parse(fs.readFileSync(fromRepo, 'utf8'));
        }
    } catch (_) {}
    const agencyHome = process.env.AGENCY_HOME;
    if (agencyHome) {
        const fromAgency = path.join(agencyHome, 'config.json');
        try {
            if (fs.existsSync(fromAgency)) {
                const agency = JSON.parse(fs.readFileSync(fromAgency, 'utf8'));
                merged = { ...merged, ...agency };
            }
        } catch (_) {}
    }
    return merged;
}

export function getConfig() {
    if (cached) return cached;
    const raw = loadRaw();
    const defaultUrl =
        process.env.EXPLORER_URL ||
        process.env.EXPLORER_DEFAULT_URL ||
        raw.defaultUrl ||
        raw.startUrl ||
        DEFAULT_URL_FALLBACK;
    cached = {
        ...raw,
        defaultUrl,
        repoRoot: REPO_ROOT,
        configPath: raw.configPath ?? path.join(REPO_ROOT, 'config.json'),
        openRouterApiKey: process.env.OPENROUTER_API_KEY || raw.OPENROUTER_API_KEY || null,
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || raw.TELEGRAM_BOT_TOKEN || '',
        telegramChatId: process.env.TELEGRAM_CHAT_ID || raw.TELEGRAM_CHAT_ID || ''
    };
    return cached;
}

export function resetConfigCache() {
    cached = null;
}
