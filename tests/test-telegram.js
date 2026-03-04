#!/usr/bin/env node
/**
 * Telegram Test Script - Debug messaging
 * Config: config.mjs (repo root or AGENCY_HOME config.json).
 */

import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = getConfig();
const TELEGRAM_TOKEN = config.telegramBotToken;
const TELEGRAM_CHAT_ID = config.telegramChatId;

console.log('\n📋 Telegram Config:');
console.log('  Token:', TELEGRAM_TOKEN ? `✅ (${TELEGRAM_TOKEN.slice(0, 10)}...)` : '❌ NOT SET');
console.log('  Chat ID:', TELEGRAM_CHAT_ID || '❌ NOT SET');

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('\n❌ Missing Telegram configuration!');
  process.exit(1);
}

function sendMessage(text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });

    console.log('\n📤 Sending request...');
    console.log('  Payload:', JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text.substring(0, 50) + '...' }));

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
        console.log('  Response status:', res.statusCode);
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            console.log('  ✅ Message sent successfully!');
            console.log('  Message ID:', result.result.message_id);
            resolve(true);
          } else {
            console.error('  ❌ Telegram API error:', result.description);
            resolve(false);
          }
        } catch (e) {
          console.error('  ❌ Failed to parse response:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('  ❌ Request error:', err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n🧪 Testing Telegram messaging...\n');
  
  const result = await sendMessage(`🧪 <b>Test Message</b>\n\nTimestamp: ${new Date().toISOString()}\n\nIf you see this, Telegram reporting is working!`);
  
  if (result) {
    console.log('\n✅ Telegram test PASSED');
  } else {
    console.log('\n❌ Telegram test FAILED');
    process.exit(1);
  }
}

main().catch(console.error);
