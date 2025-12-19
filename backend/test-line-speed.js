/**
 * 模擬 LINE 訊息處理速度測試
 * 測量從收到訊息到生成回覆的完整時間
 */

import { handleMessage } from './src/intentRouter.js';
import { initIntentClassifier } from './src/intentClassifier.js';
import { loadFAQData } from './src/faqRetriever.js';
import { initGemini } from './src/gemini.js';
import dotenv from 'dotenv';
dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// 模擬真實用戶會發送的訊息
const realWorldMessages = [
  '你好',
  '我要訂機票',
  '去泰國要簽證嗎',
  '機票多少錢',
  '改票',
  '怎麼付款',
  '可以帶幾公斤行李',
];

async function testLineSpeed() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}${colors.bold}LINE 訊息回應速度測試${colors.reset}`);
  console.log('='.repeat(60));

  // 初始化（模擬服務啟動）
  console.log('\n初始化系統...');
  const initStart = Date.now();
  initGemini();
  initIntentClassifier();
  await loadFAQData();
  console.log(`初始化完成：${Date.now() - initStart}ms\n`);

  // 暖機
  console.log('暖機中...');
  await handleMessage('測試', 'warmup');
  console.log('暖機完成\n');

  console.log('-'.repeat(60));
  console.log('模擬用戶發送訊息：\n');

  const results = [];

  for (const message of realWorldMessages) {
    const sessionId = `line-test-${Date.now()}`;

    const start = Date.now();
    const result = await handleMessage(message, sessionId);
    const duration = Date.now() - start;

    results.push({ message, duration, intent: result.intent });

    // 顯示結果
    const speedColor = duration < 1500 ? colors.green : duration < 2500 ? colors.yellow : colors.red;
    console.log(`👤 "${message}"`);
    console.log(`🤖 ${result.reply.substring(0, 60)}...`);
    console.log(`⏱️  回應時間: ${speedColor}${duration}ms${colors.reset} | 意圖: ${result.intent}`);
    console.log('');

    // 間隔避免 API 限制
    await new Promise(r => setTimeout(r, 500));
  }

  // 統計
  console.log('='.repeat(60));
  console.log(`${colors.cyan}${colors.bold}統計結果${colors.reset}`);
  console.log('='.repeat(60));

  const times = results.map(r => r.duration);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`\n測試訊息數: ${results.length}`);
  console.log(`平均回應時間: ${colors.cyan}${avg.toFixed(0)}ms${colors.reset}`);
  console.log(`最快: ${colors.green}${min}ms${colors.reset}`);
  console.log(`最慢: ${colors.yellow}${max}ms${colors.reset}`);

  // 評估
  console.log('\n' + '-'.repeat(60));
  if (avg < 1500) {
    console.log(`${colors.green}✓ 效能良好！平均回應時間在 1.5 秒內${colors.reset}`);
  } else if (avg < 2500) {
    console.log(`${colors.yellow}⚠ 效能尚可，但可以再優化${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ 效能需要優化，回應時間過長${colors.reset}`);
  }

  console.log('\n預估 LINE 用戶體驗：');
  console.log(`  本地處理: ~${avg.toFixed(0)}ms`);
  console.log(`  + 網路延遲: ~100-200ms`);
  console.log(`  + LINE API: ~100-300ms`);
  console.log(`  ────────────────────`);
  console.log(`  ${colors.bold}總計約: ${(avg + 300).toFixed(0)}-${(avg + 500).toFixed(0)}ms${colors.reset}`);
  console.log('\n');
}

testLineSpeed().catch(console.error);
