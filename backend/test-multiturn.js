/**
 * 金龍永盛 AI 客服 - 多輪對話測試腳本
 * 測試對話延續性和狀態管理
 */

import { handleMessage } from './src/intentRouter.js';
import { initIntentClassifier } from './src/intentClassifier.js';
import { loadFAQData } from './src/faqRetriever.js';
import { initGemini } from './src/gemini.js';
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

// 多輪對話測試案例
const multiTurnTests = [
  {
    name: '訂票流程 - 逐步提供資訊',
    conversation: [
      { user: '我要訂機票', expectIntent: 'TICKET_BOOK', expectAwaiting: true },
      { user: '東京', expectIntent: 'TICKET_BOOK', expectContinuation: true },
      { user: '3/26', expectIntent: 'TICKET_BOOK', expectContinuation: true },
      { user: '2位', expectIntent: 'TICKET_BOOK', expectContinuation: true },
    ],
  },
  {
    name: '改票流程 - 提供日期',
    conversation: [
      { user: '我要改機票', expectIntent: 'TICKET_CHANGE', expectAwaiting: true },
      { user: '回程改成4/1', expectIntent: 'TICKET_CHANGE', expectContinuation: true },
      { user: 'BTE2500208', expectIntent: 'TICKET_CHANGE', expectContinuation: true },
    ],
  },
  {
    name: '報價查詢 - 一次性提供資訊',
    conversation: [
      { user: '去曼谷的機票多少錢', expectIntent: 'QUOTE_REQUEST', expectAwaiting: true },
      { user: '下週一', expectIntent: 'QUOTE_REQUEST', expectContinuation: true },
    ],
  },
  {
    name: '航班查詢流程',
    conversation: [
      { user: '有沒有飛香港的班機', expectIntent: 'FLIGHT_QUERY', expectAwaiting: true },
      { user: '明天', expectIntent: 'FLIGHT_QUERY', expectContinuation: true },
    ],
  },
  {
    name: '意圖切換 - 不應延續',
    conversation: [
      { user: '我要訂機票', expectIntent: 'TICKET_BOOK', expectAwaiting: true },
      { user: '去泰國要簽證嗎', expectIntent: 'VISA_INQUIRY', expectContinuation: false },
    ],
  },
  {
    name: '確認語延續',
    conversation: [
      { user: '報價', expectIntent: 'QUOTE_REQUEST', expectAwaiting: true },
      { user: '新加坡', expectIntent: 'QUOTE_REQUEST', expectContinuation: true },
      { user: '好', expectIntent: 'QUOTE_REQUEST', expectContinuation: true },
    ],
  },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMultiTurnTests() {
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.cyan}${colors.bold}金龍永盛 AI 客服 - 多輪對話測試${colors.reset}`);
  console.log('='.repeat(70) + '\n');

  // 初始化
  console.log('正在初始化...');
  try {
    initGemini();
    initIntentClassifier();
    await loadFAQData();
    console.log('初始化完成！\n');
  } catch (error) {
    console.error('初始化失敗:', error.message);
    return;
  }

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = [];

  for (const testCase of multiTurnTests) {
    console.log(`\n${colors.blue}${colors.bold}【${testCase.name}】${colors.reset}`);
    console.log('-'.repeat(60));

    // 每個對話使用獨立的 session
    const sessionId = `test-multiturn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let testPassed = true;

    for (let i = 0; i < testCase.conversation.length; i++) {
      const turn = testCase.conversation[i];
      totalTests++;

      console.log(`\n${colors.dim}第 ${i + 1} 輪${colors.reset}`);
      console.log(`👤 用戶: "${turn.user}"`);

      try {
        const result = await handleMessage(turn.user, sessionId);

        // 檢查意圖
        const intentMatch = result.intent === turn.expectIntent;
        const continuationMatch = turn.expectContinuation === undefined ||
          result.isContinuation === turn.expectContinuation;
        const awaitingMatch = turn.expectAwaiting === undefined ||
          (turn.expectAwaiting ? result.awaitingInfo?.length > 0 : true);

        console.log(`🤖 AI: ${result.reply.substring(0, 100)}${result.reply.length > 100 ? '...' : ''}`);
        console.log(`${colors.dim}   意圖: ${result.intent} | 延續: ${result.isContinuation ? '是' : '否'} | 等待: ${result.awaitingInfo?.join(', ') || '無'}${colors.reset}`);

        if (intentMatch && continuationMatch && awaitingMatch) {
          passedTests++;
          console.log(`${colors.green}✓ 測試通過${colors.reset}`);
        } else {
          testPassed = false;
          const errors = [];
          if (!intentMatch) errors.push(`意圖不符 (預期: ${turn.expectIntent}, 實際: ${result.intent})`);
          if (!continuationMatch) errors.push(`延續判斷不符 (預期: ${turn.expectContinuation}, 實際: ${result.isContinuation})`);
          if (!awaitingMatch) errors.push(`等待資訊不符`);

          console.log(`${colors.red}✗ 測試失敗: ${errors.join(', ')}${colors.reset}`);
          failedTests.push({
            testCase: testCase.name,
            turn: i + 1,
            message: turn.user,
            errors,
          });
        }

        // 避免 API 速率限制
        await sleep(500);
      } catch (error) {
        testPassed = false;
        console.log(`${colors.red}✗ 錯誤: ${error.message}${colors.reset}`);
        failedTests.push({
          testCase: testCase.name,
          turn: i + 1,
          message: turn.user,
          errors: [error.message],
        });
      }
    }

    if (testPassed) {
      console.log(`\n${colors.green}✓ ${testCase.name} - 全部通過${colors.reset}`);
    } else {
      console.log(`\n${colors.red}✗ ${testCase.name} - 有失敗${colors.reset}`);
    }
  }

  // 總結報告
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.cyan}${colors.bold}測試結果摘要${colors.reset}`);
  console.log('='.repeat(70));
  console.log(`總測試數: ${totalTests}`);
  console.log(`${colors.green}通過: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}失敗: ${failedTests.length}${colors.reset}`);
  console.log(`準確率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests.length > 0) {
    console.log(`\n${colors.red}失敗的測試:${colors.reset}`);
    for (const fail of failedTests) {
      console.log(`  - ${fail.testCase} (第 ${fail.turn} 輪): "${fail.message}"`);
      console.log(`    ${fail.errors.join(', ')}`);
    }
  }

  console.log('\n');
}

runMultiTurnTests().catch(console.error);
