#!/usr/bin/env node
/**
 * Hyper-Explorer Telemetry
 * Self-contained Telegram reporting for explorer runs.
 * Config: config.mjs (repo root or AGENCY_HOME config.json), or env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, '..', 'memory');

const config = getConfig();
const TELEGRAM_TOKEN = config.telegramBotToken || '';
const TELEGRAM_CHAT_ID = config.telegramChatId || '';
const ENABLED = TELEGRAM_TOKEN && TELEGRAM_CHAT_ID;

// Debug log (only if ENABLED to avoid noise)
if (ENABLED) {
  console.log('[Telemetry] Config loaded:', { 
    token: TELEGRAM_TOKEN ? `✅ (${TELEGRAM_TOKEN.slice(0, 10)}...)` : '❌ not set', 
    chatId: TELEGRAM_CHAT_ID || '❌ not set',
    enabled: ENABLED 
  });
}

/**
 * Send message to Telegram
 */
export async function sendTelegramMessage(text, options = {}) {
  if (!ENABLED) {
    console.log('[Telemetry] Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)');
    return false;
  }

  const payload = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: options.parse_mode || 'HTML',
    disable_notification: options.silent || false
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.ok);
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

/**
 * Send photo to Telegram
 */
export async function sendTelegramPhoto(photoPath, caption = '') {
  if (!ENABLED || !fs.existsSync(photoPath)) return false;

  // For simplicity, just send a message with the path
  // Full multipart upload would require additional dependencies
  return sendTelegramMessage(`📸 <b>Screenshot</b>\n${caption}\n\nPath: ${photoPath}`);
}

/**
 * Report explorer run results
 */
export async function reportExplorerRun(goal, success, duration, details = {}) {
  const status = success ? '✅ SUCCESS' : '❌ FAILED';
  const timestamp = new Date().toISOString();
  
  const message = `
<b>🕹️ Hyper-Explorer Run</b>

<b>Goal:</b> ${goal}
<b>Status:</b> ${status}
<b>Duration:</b> ${(duration / 1000).toFixed(1)}s
<b>Time:</b> ${timestamp}

${details.error ? `<b>Error:</b> ${details.error}\n` : ''}
${details.coverage ? `<b>Coverage:</b> ${details.coverage}\n` : ''}
${details.nodes ? `<b>Nodes:</b> ${details.nodes}\n` : ''}
  `.trim();

  return sendTelegramMessage(message);
}

/**
 * Report full flow completion
 */
export async function reportFlowComplete(results) {
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  const lines = results.map(r => {
    const icon = r.success ? '✅' : '❌';
    return `${icon} ${r.name}: ${r.success ? 'PASS' : 'FAIL'}`;
  });

  const message = `
<b>🧪 Hyper-Explorer Full Flow</b>

${lines.join('\n')}

<b>Result:</b> ${passed}/${total} passed
<b>Time:</b> ${new Date().toISOString()}
  `.trim();

  return sendTelegramMessage(message);
}

/**
 * Save local telemetry log
 */
export function logTelemetry(event, data) {
  const logFile = path.join(MEMORY_DIR, 'telemetry.jsonl');
  const entry = {
    timestamp: Date.now(),
    event,
    data
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

// Export for use in explorer
export default {
  sendMessage: sendTelegramMessage,
  sendPhoto: sendTelegramPhoto,
  reportRun: reportExplorerRun,
  reportFlow: reportFlowComplete,
  log: logTelemetry,
  isEnabled: () => ENABLED
};
