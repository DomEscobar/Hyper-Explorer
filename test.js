#!/usr/bin/env node
/**
 * Quick integration test for Hyper-Explorer
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPLORER = path.join(__dirname, 'src', 'hyper-explorer-mcp.mjs');
const URL = process.argv[2] || process.env.EXPLORER_URL || getConfig().defaultUrl;

const TESTS = [
  { name: 'Register', goal: 'register_new_user_complete_flow' },
  { name: 'Login', goal: 'login_existing_user_successful_login' },
  { name: 'Squad', goal: 'create_fighter_squad' },
  { name: 'Match', goal: 'start_and_complete_match' }
];

console.log('🧪 Hyper-Explorer Integration Test\n');
console.log(`Target: ${URL}\n`);

let passed = 0;
let failed = 0;

for (const test of TESTS) {
  process.stdout.write(`${test.name.padEnd(10)} ... `);
  
  try {
    const result = await new Promise((resolve) => {
      const proc = spawn('node', [EXPLORER, URL, test.goal], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      proc.stdout.on('data', (d) => output += d);
      proc.stderr.on('data', (d) => output += d);
      
      proc.on('close', (code) => {
        const success = output.includes('Goal achieved');
        resolve({ success, output });
      });
    });
    
    if (result.success) {
      console.log('✅ PASS');
      passed++;
    } else {
      console.log('❌ FAIL');
      failed++;
    }
  } catch (e) {
    console.log('❌ ERROR');
    failed++;
  }
}

console.log(`\n${passed}/${TESTS.length} tests passed`);
process.exit(failed > 0 ? 1 : 0);
