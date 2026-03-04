#!/usr/bin/env node
/**
 * Full Flow Test Orchestrator with Telegram Reporting
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import telemetry from './src/telemetry.mjs';
import { getConfig } from './src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HYPER = path.join(__dirname, 'src', 'hyper-explorer-mcp.mjs');
const URL = process.env.EXPLORER_URL || getConfig().defaultUrl;
const MEMORY_DIR = path.join(__dirname, 'memory');

const STEPS = [
  { id: 'REG', goal: 'register_new_user_complete_flow' },
  { id: 'LOG', goal: 'login_existing_user_successful_login' },
  { id: 'SQUAD', goal: 'create_fighter_squad' },
  { id: 'MATCH1', goal: 'start_and_complete_match' },
  { id: 'MATCH2', goal: 'start_and_complete_match' },
  { id: 'MATCH3', goal: 'start_and_complete_match' }
];

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('FULL FLOW TEST');
  console.log('='.repeat(60) + '\n');

  try {
    fs.unlinkSync(path.join(MEMORY_DIR, 'knowledge_graph.json'));
    console.log('Cleared old graph\n');
  } catch (e) {}

  const results = [];

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    console.log(`\nSTEP ${i+1}/${STEPS.length}: ${step.id} - ${step.goal}\n`);

    const proc = spawn('node', [HYPER, URL, step.goal], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    const code = await new Promise(resolve => {
      proc.on('close', resolve);
    });

    const success = code === 0;
    results.push({ name: step.id, success, goal: step.goal });

    if (i < STEPS.length - 1) {
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('ALL STEPS COMPLETE');
  console.log('='.repeat(60) + '\n');

  // Report to Telegram
  await telemetry.reportFlow(results);

  // Summary
  const passed = results.filter(r => r.success).length;
  console.log(`\nResults: ${passed}/${results.length} passed`);
  results.forEach(r => {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}`);
  });
}

run().catch(console.error);
