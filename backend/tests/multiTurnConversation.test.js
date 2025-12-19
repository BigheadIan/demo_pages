/**
 * 多輪對話測試
 * 測試各種需要收集資訊的意圖場景
 */

import { handleMessage } from '../src/intentRouter.js';
import { initIntentClassifier } from '../src/intentClassifier.js';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

// 測試輔助函數
function createTestContext(sessionId) {
  return {
    sessionId,
    conversationId: sessionId,
    isFromDatabase: false,
  };
}

function logStep(step, message, response) {
  console.log(`\n  步驟 ${step}: 用戶說「${message}」`);
  console.log(`  → 意圖: ${response.intent} (${response.intentName})`);
  console.log(`  → 回覆: ${response.reply?.substring(0, 100)}${response.reply?.length > 100 ? '...' : ''}`);
  console.log(`  → 等待資訊: ${response.awaitingInfo?.join(', ') || '無'}`);
  console.log(`  → 延續對話: ${response.isContinuation ? '是' : '否'}`);
  console.log(`  → 需轉人工: ${response.requiresHuman ? '是' : '否'}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ 斷言失敗: ${message}`);
  }
}

// ============ 測試案例 ============

/**
 * 測試 1: 訂票流程 - 完整資訊收集到確認
 */
async function testTicketBookingFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 1: 訂票流程（TICKET_BOOK）');
  console.log('='.repeat(60));

  const sessionId = `test-booking-${Date.now()}`;

  // Step 1: 初始訂票請求（只提供部分資訊）
  let response = await handleMessage('我想訂去東京的機票', sessionId);
  logStep(1, '我想訂去東京的機票', response);
  assert(response.intent === 'TICKET_BOOK', '意圖應為 TICKET_BOOK');
  assert(response.awaitingInfo?.length > 0, '應該等待更多資訊');

  // Step 2: 提供日期
  response = await handleMessage('3/26', sessionId);
  logStep(2, '3/26', response);
  assert(response.isContinuation === true, '應該延續上一個意圖');
  assert(response.intent === 'TICKET_BOOK', '意圖應保持 TICKET_BOOK');

  // Step 3: 提供人數
  response = await handleMessage('2位', sessionId);
  logStep(3, '2位', response);
  assert(response.isContinuation === true, '應該延續上一個意圖');
  assert(response.awaitingInfo?.includes('CONFIRMATION'), '應該等待用戶確認');

  // Step 4: 確認
  response = await handleMessage('確認', sessionId);
  logStep(4, '確認', response);
  assert(response.isContinuation === true, '應該延續上一個意圖');
  assert(response.requiresHuman === true, '確認後應轉人工');
  assert(response.reply?.includes('已確認'), '回覆應包含確認訊息');

  console.log('\n✅ 測試 1 通過：訂票流程正常');
  return true;
}

/**
 * 測試 2: 訂票流程 - 一次提供完整資訊
 */
async function testTicketBookingCompleteInfo() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 2: 訂票完整資訊一次提供');
  console.log('='.repeat(60));

  const sessionId = `test-booking-complete-${Date.now()}`;

  // 一次提供所有資訊
  let response = await handleMessage('我要訂3/26去東京的機票，2位大人', sessionId);
  logStep(1, '我要訂3/26去東京的機票，2位大人', response);
  assert(response.intent === 'TICKET_BOOK', '意圖應為 TICKET_BOOK');
  assert(response.awaitingInfo?.includes('CONFIRMATION'), '應該等待用戶確認');

  // 確認
  response = await handleMessage('好', sessionId);
  logStep(2, '好', response);
  assert(response.requiresHuman === true, '確認後應轉人工');

  console.log('\n✅ 測試 2 通過：完整資訊訂票正常');
  return true;
}

/**
 * 測試 3: 改票流程
 */
async function testTicketChangeFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 3: 改票流程（TICKET_CHANGE）');
  console.log('='.repeat(60));

  const sessionId = `test-change-${Date.now()}`;

  // Step 1: 改票請求
  let response = await handleMessage('我要改機票', sessionId);
  logStep(1, '我要改機票', response);
  assert(response.intent === 'TICKET_CHANGE', '意圖應為 TICKET_CHANGE');
  assert(response.requiresHuman === true, '改票應轉人工處理');

  // Step 2: 提供新日期和訂位代號（一次提供完整資訊）
  response = await handleMessage('改成4/1，訂位代號 BTE2500208', sessionId);
  logStep(2, '改成4/1，訂位代號 BTE2500208', response);
  // 改票流程通常直接轉人工，不需要多輪對話
  assert(response.requiresHuman === true, '改票應轉人工');

  console.log('\n✅ 測試 3 通過：改票流程正常');
  return true;
}

/**
 * 測試 4: 報價查詢
 */
async function testQuoteRequestFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 4: 報價查詢（QUOTE_REQUEST）');
  console.log('='.repeat(60));

  const sessionId = `test-quote-${Date.now()}`;

  // Step 1: 報價請求
  let response = await handleMessage('去曼谷多少錢', sessionId);
  logStep(1, '去曼谷多少錢', response);
  assert(response.intent === 'QUOTE_REQUEST', '意圖應為 QUOTE_REQUEST');

  // Step 2: 提供日期
  response = await handleMessage('下個月', sessionId);
  logStep(2, '下個月', response);
  assert(response.isContinuation === true, '應該延續上一個意圖');

  // Step 3: 提供人數
  response = await handleMessage('4個人', sessionId);
  logStep(3, '4個人', response);
  assert(response.isContinuation === true, '應該延續上一個意圖');

  console.log('\n✅ 測試 4 通過：報價查詢正常');
  return true;
}

/**
 * 測試 5: 退票請求
 */
async function testTicketCancelFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 5: 退票請求（TICKET_CANCEL）');
  console.log('='.repeat(60));

  const sessionId = `test-cancel-${Date.now()}`;

  // Step 1: 退票請求
  let response = await handleMessage('我要退票', sessionId);
  logStep(1, '我要退票', response);
  assert(response.intent === 'TICKET_CANCEL', '意圖應為 TICKET_CANCEL');
  // 退票涉及費用計算，必須轉人工處理
  assert(response.requiresHuman === true, '退票應轉人工處理');
  assert(response.reply?.includes('退票'), '回覆應包含退票相關資訊');

  // Step 2: 提供訂位代號
  response = await handleMessage('訂位代號 BTE2500301', sessionId);
  logStep(2, '訂位代號 BTE2500301', response);
  // 退票流程直接轉人工，訂位代號會在訊息中提取
  assert(response.requiresHuman === true, '退票應轉人工處理');

  console.log('\n✅ 測試 5 通過：退票請求正常');
  return true;
}

/**
 * 測試 6: 簽證查詢
 */
async function testVisaInquiryFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 6: 簽證查詢（VISA_INQUIRY）');
  console.log('='.repeat(60));

  const sessionId = `test-visa-${Date.now()}`;

  // Step 1: 簽證查詢
  let response = await handleMessage('去泰國需要簽證嗎', sessionId);
  logStep(1, '去泰國需要簽證嗎', response);
  assert(response.intent === 'VISA_INQUIRY', '意圖應為 VISA_INQUIRY');
  // 簽證查詢通常可以直接從 FAQ 回覆
  assert(response.reply?.length > 0, '應該有回覆內容');

  console.log('\n✅ 測試 6 通過：簽證查詢正常');
  return true;
}

/**
 * 測試 7: 座位選擇
 */
async function testSeatRequestFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 7: 座位選擇（SEAT_REQUEST）');
  console.log('='.repeat(60));

  const sessionId = `test-seat-${Date.now()}`;

  // Step 1: 座位請求（含完整資訊）
  let response = await handleMessage('我想選靠窗的位子，訂位代號 BTE2500105', sessionId);
  logStep(1, '我想選靠窗的位子，訂位代號 BTE2500105', response);
  assert(response.intent === 'SEAT_REQUEST', '意圖應為 SEAT_REQUEST');
  assert(response.reply?.includes('靠窗') || response.reply?.includes('座位'), '回覆應包含座位偏好');

  console.log('\n✅ 測試 7 通過：座位選擇正常');
  return true;
}

/**
 * 測試 8: 意圖切換（中途改變需求）
 */
async function testIntentSwitching() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 8: 意圖切換');
  console.log('='.repeat(60));

  const sessionId = `test-switch-${Date.now()}`;

  // Step 1: 開始訂票
  let response = await handleMessage('我要訂去大阪的機票', sessionId);
  logStep(1, '我要訂去大阪的機票', response);
  assert(response.intent === 'TICKET_BOOK', '意圖應為 TICKET_BOOK');

  // Step 2: 突然問簽證問題（明確的意圖切換）
  response = await handleMessage('等等，去日本需要簽證嗎', sessionId);
  logStep(2, '等等，去日本需要簽證嗎', response);
  // 這裡應該識別為新的意圖
  console.log(`  (意圖是否切換: ${response.intent !== 'TICKET_BOOK' ? '是' : '否'})`);

  // Step 3: 回到訂票
  response = await handleMessage('好的，那我要訂5/1去大阪，3位', sessionId);
  logStep(3, '好的，那我要訂5/1去大阪，3位', response);
  assert(response.intent === 'TICKET_BOOK', '應該回到 TICKET_BOOK');

  console.log('\n✅ 測試 8 通過：意圖切換正常');
  return true;
}

/**
 * 測試 9: 確認語變化測試
 */
async function testConfirmationVariations() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 9: 確認語變化');
  console.log('='.repeat(60));

  const confirmations = ['好', '好的', 'OK', '可以', '對', '沒問題', '是的', '確認', '確定', '對的'];

  for (const confirm of confirmations) {
    const sessionId = `test-confirm-${confirm}-${Date.now()}`;

    // 快速完成前置步驟
    await handleMessage('訂3/26去東京2位', sessionId);

    // 測試確認語
    const response = await handleMessage(confirm, sessionId);
    const passed = response.requiresHuman === true && response.reply?.includes('確認');

    console.log(`  「${confirm}」: ${passed ? '✅' : '❌'}`);

    if (!passed) {
      console.log(`    回覆: ${response.reply?.substring(0, 50)}...`);
    }
  }

  console.log('\n✅ 測試 9 完成：確認語變化測試');
  return true;
}

/**
 * 測試 10: 付款請求
 */
async function testPaymentRequestFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 10: 付款請求（PAYMENT_REQUEST）');
  console.log('='.repeat(60));

  const sessionId = `test-payment-${Date.now()}`;

  // Step 1: 付款請求（含訂位代號）
  let response = await handleMessage('我要付款，訂位代號 BTE2500199', sessionId);
  logStep(1, '我要付款，訂位代號 BTE2500199', response);
  assert(response.intent === 'PAYMENT_REQUEST', '意圖應為 PAYMENT_REQUEST');
  assert(response.requiresHuman === true, '付款應轉人工發送連結');
  assert(response.reply?.includes('付款') || response.reply?.includes('刷卡'), '回覆應包含付款資訊');

  console.log('\n✅ 測試 10 通過：付款請求正常');
  return true;
}

/**
 * 測試 11: 轉人工
 */
async function testTransferAgent() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 11: 轉人工（TRANSFER_AGENT）');
  console.log('='.repeat(60));

  const sessionId = `test-transfer-${Date.now()}`;

  // 直接要求轉人工
  const response = await handleMessage('我要找真人客服', sessionId);
  logStep(1, '我要找真人客服', response);
  assert(response.intent === 'TRANSFER_AGENT', '意圖應為 TRANSFER_AGENT');
  assert(response.requiresHuman === true, '應轉人工');

  console.log('\n✅ 測試 11 通過：轉人工正常');
  return true;
}

/**
 * 測試 12: 短訊息延續（數字回覆）
 */
async function testShortMessageContinuation() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 測試 12: 短訊息延續');
  console.log('='.repeat(60));

  const sessionId = `test-short-${Date.now()}`;

  // Step 1: 報價請求
  let response = await handleMessage('去香港多少', sessionId);
  logStep(1, '去香港多少', response);

  // Step 2: 只回覆數字
  response = await handleMessage('2', sessionId);
  logStep(2, '2', response);
  assert(response.isContinuation === true, '數字回覆應延續上一個意圖');

  // Step 3: 只回覆日期
  response = await handleMessage('下週五', sessionId);
  logStep(3, '下週五', response);
  assert(response.isContinuation === true, '日期回覆應延續上一個意圖');

  console.log('\n✅ 測試 12 通過：短訊息延續正常');
  return true;
}

// ============ 主測試運行器 ============

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        金龍永盛 AI 客服 - 多輪對話測試                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n開始時間: ${new Date().toLocaleString('zh-TW')}`);

  // 初始化意圖分類器
  console.log('\n🔧 初始化意圖分類器...');
  const initialized = initIntentClassifier();
  if (!initialized) {
    console.error('❌ 意圖分類器初始化失敗，請檢查 GEMINI_API_KEY 環境變數');
    process.exit(1);
  }
  console.log('✅ 意圖分類器已就緒\n');

  const tests = [
    { name: '訂票流程', fn: testTicketBookingFlow },
    { name: '完整資訊訂票', fn: testTicketBookingCompleteInfo },
    { name: '改票流程', fn: testTicketChangeFlow },
    { name: '報價查詢', fn: testQuoteRequestFlow },
    { name: '退票請求', fn: testTicketCancelFlow },
    { name: '簽證查詢', fn: testVisaInquiryFlow },
    { name: '座位選擇', fn: testSeatRequestFlow },
    { name: '意圖切換', fn: testIntentSwitching },
    { name: '確認語變化', fn: testConfirmationVariations },
    { name: '付款請求', fn: testPaymentRequestFlow },
    { name: '轉人工', fn: testTransferAgent },
    { name: '短訊息延續', fn: testShortMessageContinuation },
  ];

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      results.push({ name: test.name, status: '✅ 通過' });
      passed++;
    } catch (error) {
      results.push({ name: test.name, status: '❌ 失敗', error: error.message });
      failed++;
      console.error(`\n❌ 測試「${test.name}」失敗:`, error.message);
    }
  }

  // 輸出總結
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      測試結果總結                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const result of results) {
    console.log(`  ${result.status} ${result.name}`);
    if (result.error) {
      console.log(`     └─ ${result.error}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`  總計: ${tests.length} 個測試`);
  console.log(`  通過: ${passed} ✅`);
  console.log(`  失敗: ${failed} ❌`);
  console.log('─'.repeat(60));
  console.log(`\n結束時間: ${new Date().toLocaleString('zh-TW')}`);

  // 返回退出碼
  process.exit(failed > 0 ? 1 : 0);
}

// 執行測試
runAllTests().catch(error => {
  console.error('測試執行錯誤:', error);
  process.exit(1);
});
