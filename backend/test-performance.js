/**
 * 金龍永盛 AI 客服 - 效能分析腳本
 * 測量各步驟的處理時間
 */

import { classifyIntent, initIntentClassifier } from './src/intentClassifier.js';
import { handleMessage } from './src/intentRouter.js';
import { extractAllEntities, flattenEntities } from './src/entityExtractor.js';
import { searchFAQ, loadFAQData } from './src/faqRetriever.js';
import { faqAutoReply, initGemini } from './src/gemini.js';
import dotenv from 'dotenv';
dotenv.config();

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

// 測試訊息
const testMessages = [
  '我要訂機票',
  '去東京的機票多少錢',
  '回程要改為3/26',
  '去泰國要簽證嗎',
  '怎麼付款',
  'BTE2500208 請開票',
];

async function measureTime(name, fn) {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { name, duration, result };
}

async function profileMessage(message) {
  console.log(`\n${colors.blue}${colors.bold}測試訊息: "${message}"${colors.reset}`);
  console.log('-'.repeat(60));

  const timings = [];

  // 1. 測試意圖分類時間
  const intentTiming = await measureTime('意圖分類 (Gemini API)', async () => {
    return await classifyIntent(message, []);
  });
  timings.push(intentTiming);
  console.log(`  ${intentTiming.name}: ${colors.yellow}${intentTiming.duration}ms${colors.reset}`);
  console.log(`    → 意圖: ${intentTiming.result.intent} (${(intentTiming.result.confidence * 100).toFixed(0)}%)`);

  // 2. 測試實體提取時間
  const entityTiming = await measureTime('實體提取 (規則式)', async () => {
    const raw = extractAllEntities(message);
    return flattenEntities(raw);
  });
  timings.push(entityTiming);
  console.log(`  ${entityTiming.name}: ${colors.green}${entityTiming.duration}ms${colors.reset}`);

  // 3. 測試 FAQ 搜尋時間
  const faqSearchTiming = await measureTime('FAQ 搜尋', async () => {
    return searchFAQ(message);
  });
  timings.push(faqSearchTiming);
  console.log(`  ${faqSearchTiming.name}: ${colors.green}${faqSearchTiming.duration}ms${colors.reset}`);
  console.log(`    → 找到 ${faqSearchTiming.result.length} 則 FAQ`);

  // 4. 測試 FAQ 自動回覆生成時間 (如果有匹配的 FAQ)
  if (faqSearchTiming.result.length > 0) {
    const faqReplyTiming = await measureTime('FAQ 回覆生成 (Gemini API)', async () => {
      return await faqAutoReply(message);
    });
    timings.push(faqReplyTiming);
    console.log(`  ${faqReplyTiming.name}: ${colors.yellow}${faqReplyTiming.duration}ms${colors.reset}`);
  }

  // 5. 測試完整處理流程時間
  const fullTiming = await measureTime('完整處理流程 (handleMessage)', async () => {
    return await handleMessage(message, `perf-test-${Date.now()}`);
  });
  timings.push(fullTiming);
  console.log(`  ${colors.bold}${fullTiming.name}: ${colors.cyan}${fullTiming.duration}ms${colors.reset}`);

  // 計算時間分佈
  const totalApiTime = timings
    .filter(t => t.name.includes('Gemini'))
    .reduce((sum, t) => sum + t.duration, 0);
  const totalLocalTime = timings
    .filter(t => !t.name.includes('Gemini') && !t.name.includes('完整'))
    .reduce((sum, t) => sum + t.duration, 0);

  console.log(`\n  ${colors.dim}時間分析:${colors.reset}`);
  console.log(`    Gemini API 呼叫: ${colors.yellow}${totalApiTime}ms${colors.reset} (${((totalApiTime / fullTiming.duration) * 100).toFixed(1)}%)`);
  console.log(`    本地處理: ${colors.green}${totalLocalTime}ms${colors.reset}`);

  return {
    message,
    fullDuration: fullTiming.duration,
    timings,
  };
}

async function runPerformanceTest() {
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.cyan}${colors.bold}金龍永盛 AI 客服 - 效能分析${colors.reset}`);
  console.log('='.repeat(70));

  // 初始化
  console.log('\n正在初始化...');
  const initStart = Date.now();

  initGemini();
  initIntentClassifier();
  await loadFAQData();

  const initTime = Date.now() - initStart;
  console.log(`初始化完成！耗時: ${initTime}ms\n`);

  // 先做一次暖機呼叫
  console.log(`${colors.dim}執行暖機呼叫...${colors.reset}`);
  await handleMessage('你好', 'warmup-test');
  console.log(`${colors.dim}暖機完成${colors.reset}`);

  // 測試各訊息
  const results = [];
  for (const message of testMessages) {
    const result = await profileMessage(message);
    results.push(result);

    // 避免 API 速率限制
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 總結報告
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.cyan}${colors.bold}效能分析總結${colors.reset}`);
  console.log('='.repeat(70));

  const avgTime = results.reduce((sum, r) => sum + r.fullDuration, 0) / results.length;
  const maxTime = Math.max(...results.map(r => r.fullDuration));
  const minTime = Math.min(...results.map(r => r.fullDuration));

  console.log(`\n${colors.bold}完整處理流程時間:${colors.reset}`);
  console.log(`  平均: ${colors.cyan}${avgTime.toFixed(0)}ms${colors.reset}`);
  console.log(`  最快: ${colors.green}${minTime}ms${colors.reset}`);
  console.log(`  最慢: ${colors.red}${maxTime}ms${colors.reset}`);

  // 找出瓶頸
  console.log(`\n${colors.bold}各步驟平均耗時:${colors.reset}`);
  const stepTimes = {};
  for (const result of results) {
    for (const timing of result.timings) {
      if (!stepTimes[timing.name]) {
        stepTimes[timing.name] = [];
      }
      stepTimes[timing.name].push(timing.duration);
    }
  }

  const stepAvgs = Object.entries(stepTimes).map(([name, times]) => ({
    name,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    max: Math.max(...times),
    count: times.length,
  })).sort((a, b) => b.avg - a.avg);

  for (const step of stepAvgs) {
    const color = step.avg > 1000 ? colors.red : step.avg > 500 ? colors.yellow : colors.green;
    console.log(`  ${step.name}:`);
    console.log(`    平均: ${color}${step.avg.toFixed(0)}ms${colors.reset} | 最大: ${step.max}ms`);
  }

  // 優化建議
  console.log(`\n${colors.bold}優化建議:${colors.reset}`);

  const intentAvg = stepAvgs.find(s => s.name.includes('意圖分類'))?.avg || 0;
  const faqReplyAvg = stepAvgs.find(s => s.name.includes('FAQ 回覆'))?.avg || 0;

  if (intentAvg > 1000) {
    console.log(`  ${colors.yellow}⚠ 意圖分類耗時過長 (${intentAvg.toFixed(0)}ms)${colors.reset}`);
    console.log(`    建議: 考慮使用更快的模型 (gemini-1.5-flash) 或快取常見意圖`);
  }

  if (faqReplyAvg > 1000) {
    console.log(`  ${colors.yellow}⚠ FAQ 回覆生成耗時過長 (${faqReplyAvg.toFixed(0)}ms)${colors.reset}`);
    console.log(`    建議: 簡化 prompt 或預先生成常見回覆`);
  }

  if (avgTime > 3000) {
    console.log(`  ${colors.red}⚠ 整體回覆時間過長 (${avgTime.toFixed(0)}ms)${colors.reset}`);
    console.log(`    建議: 考慮並行處理意圖分類和實體提取`);
  }

  console.log('\n');
}

runPerformanceTest().catch(console.error);
