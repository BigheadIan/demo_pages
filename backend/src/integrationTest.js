/**
 * 金龍永盛 AI 客服系統 - 整合測試腳本
 *
 * 測試所有 16 項意圖的對話流程
 */

// 測試目標 URL（可切換本地或 Cloud Run）
const BASE_URL = process.env.TEST_URL || 'https://golden-dragon-ai-842316685130.asia-east1.run.app';

// ============ 測試案例定義 ============

const intentTestCases = {
  // 機票服務類
  TICKET_BOOK: {
    name: '訂票請求',
    cases: [
      { input: '我要訂機票', expectedIntent: 'TICKET_BOOK' },
      { input: '請幫我訂票', expectedIntent: 'TICKET_BOOK' },
      { input: 'BTE2500208 請開票', expectedIntent: 'TICKET_BOOK' },
      { input: '我要訂3月26日去東京的機票', expectedIntent: 'TICKET_BOOK' },
      { input: '幫我訂兩張去香港的機票', expectedIntent: 'TICKET_BOOK' },
    ],
  },
  TICKET_CHANGE: {
    name: '改票請求',
    cases: [
      { input: '我要改票', expectedIntent: 'TICKET_CHANGE' },
      { input: '回程要改為3/26', expectedIntent: 'TICKET_CHANGE' },
      { input: 'BTE2500208 改票', expectedIntent: 'TICKET_CHANGE' },
      { input: '我想把機票改到下週', expectedIntent: 'TICKET_CHANGE' },
      { input: '可以幫我改航班嗎', expectedIntent: 'TICKET_CHANGE' },
      { input: '想升等商務艙', expectedIntent: 'TICKET_CHANGE' },
    ],
  },
  TICKET_CANCEL: {
    name: '退票請求',
    cases: [
      { input: '我要退票', expectedIntent: 'TICKET_CANCEL' },
      { input: '取消訂位', expectedIntent: 'TICKET_CANCEL' },
      { input: '不去了要退掉', expectedIntent: 'TICKET_CANCEL' },
      { input: 'BTE2500208 退票', expectedIntent: 'TICKET_CANCEL' },
      { input: '機票可以退嗎', expectedIntent: 'TICKET_CANCEL' },
    ],
  },
  QUOTE_REQUEST: {
    name: '報價查詢',
    cases: [
      { input: '機票多少錢', expectedIntent: 'QUOTE_REQUEST' },
      { input: '請報價', expectedIntent: 'QUOTE_REQUEST' },
      { input: '去東京要多少錢', expectedIntent: 'QUOTE_REQUEST' },
      { input: '商務艙票價是多少', expectedIntent: 'QUOTE_REQUEST' },
      { input: '費用怎麼算', expectedIntent: 'QUOTE_REQUEST' },
    ],
  },
  FLIGHT_QUERY: {
    name: '航班查詢',
    cases: [
      { input: '有什麼航班', expectedIntent: 'FLIGHT_QUERY' },
      { input: '當天有幾班飛機', expectedIntent: 'FLIGHT_QUERY' },
      { input: '機位還有嗎', expectedIntent: 'FLIGHT_QUERY' },
      { input: '3/26 台北飛東京有什麼班次', expectedIntent: 'FLIGHT_QUERY' },
      { input: 'CX472 還有位子嗎', expectedIntent: 'FLIGHT_QUERY' },
    ],
  },
  BOOKING_STATUS: {
    name: '訂位狀態查詢',
    cases: [
      { input: '訂位確認了嗎', expectedIntent: 'BOOKING_STATUS' },
      { input: '電子機票寄了嗎', expectedIntent: 'BOOKING_STATUS' },
      { input: 'BTE2500208 訂位狀態', expectedIntent: 'BOOKING_STATUS' },
      { input: '我的機票開好了嗎', expectedIntent: 'BOOKING_STATUS' },
      { input: '訂單進度如何', expectedIntent: 'BOOKING_STATUS' },
    ],
  },

  // 簽證護照類
  VISA_INQUIRY: {
    name: '簽證諮詢',
    cases: [
      { input: '去泰國要簽證嗎', expectedIntent: 'VISA_INQUIRY' },
      { input: '辦台胞證需要什麼', expectedIntent: 'VISA_INQUIRY' },
      { input: '日本免簽可以待幾天', expectedIntent: 'VISA_INQUIRY' },
      { input: '越南簽證怎麼辦', expectedIntent: 'VISA_INQUIRY' },
      { input: '申根簽證要準備什麼', expectedIntent: 'VISA_INQUIRY' },
    ],
  },
  VISA_PROGRESS: {
    name: '簽證進度查詢',
    cases: [
      { input: '台胞證辦好了嗎', expectedIntent: 'VISA_PROGRESS' },
      { input: '護照進度如何', expectedIntent: 'VISA_PROGRESS' },
      { input: '簽證什麼時候會好', expectedIntent: 'VISA_PROGRESS' },
      { input: '我的台胞證送件了嗎', expectedIntent: 'VISA_PROGRESS' },
    ],
  },

  // 付款收據類
  PAYMENT_REQUEST: {
    name: '付款請求',
    cases: [
      { input: '給我刷卡連結', expectedIntent: 'PAYMENT_REQUEST' },
      { input: '我要付款', expectedIntent: 'PAYMENT_REQUEST' },
      { input: '可以刷卡嗎', expectedIntent: 'PAYMENT_REQUEST' },
      { input: '匯款資訊給我', expectedIntent: 'PAYMENT_REQUEST' },
      { input: '怎麼付錢', expectedIntent: 'PAYMENT_REQUEST' },
    ],
  },
  RECEIPT_REQUEST: {
    name: '收據請求',
    cases: [
      { input: '我需要收據', expectedIntent: 'RECEIPT_REQUEST' },
      { input: '請給我發票', expectedIntent: 'RECEIPT_REQUEST' },
      { input: '統編 12345678', expectedIntent: 'RECEIPT_REQUEST' },
      { input: '可以開公司抬頭嗎', expectedIntent: 'RECEIPT_REQUEST' },
      { input: '需要三聯式發票', expectedIntent: 'RECEIPT_REQUEST' },
    ],
  },

  // 資訊提供類
  PASSENGER_INFO: {
    name: '旅客資料',
    cases: [
      { input: '護照資料如下', expectedIntent: 'PASSENGER_INFO' },
      { input: '英文名是 WANG/XIAOMING', expectedIntent: 'PASSENGER_INFO' },
      { input: '旅客資料給你', expectedIntent: 'PASSENGER_INFO' },
      { input: '我的護照號碼是 123456789', expectedIntent: 'PASSENGER_INFO' },
    ],
  },
  BAGGAGE_INQUIRY: {
    name: '行李查詢',
    cases: [
      { input: '可以帶幾公斤', expectedIntent: 'BAGGAGE_INQUIRY' },
      { input: '行李額度是多少', expectedIntent: 'BAGGAGE_INQUIRY' },
      { input: '經濟艙可以託運多少', expectedIntent: 'BAGGAGE_INQUIRY' },
      { input: '手提行李限制', expectedIntent: 'BAGGAGE_INQUIRY' },
    ],
  },
  SEAT_REQUEST: {
    name: '選位需求',
    cases: [
      { input: '要靠窗的位子', expectedIntent: 'SEAT_REQUEST' },
      { input: '靠走道', expectedIntent: 'SEAT_REQUEST' },
      { input: '可以選前排嗎', expectedIntent: 'SEAT_REQUEST' },
      { input: '我想坐窗邊', expectedIntent: 'SEAT_REQUEST' },
    ],
  },

  // 對話管理類
  GREETING: {
    name: '問候/閒聊',
    cases: [
      { input: '你好', expectedIntent: 'GREETING' },
      { input: '早安', expectedIntent: 'GREETING' },
      { input: '謝謝', expectedIntent: 'GREETING' },
      { input: '收到', expectedIntent: 'GREETING' },
      { input: '好的', expectedIntent: 'GREETING' },
    ],
  },
  TRANSFER_AGENT: {
    name: '轉人工',
    cases: [
      { input: '找真人', expectedIntent: 'TRANSFER_AGENT' },
      { input: '請客服打給我', expectedIntent: 'TRANSFER_AGENT' },
      { input: '我要找人工客服', expectedIntent: 'TRANSFER_AGENT' },
      { input: '太複雜了找真人', expectedIntent: 'TRANSFER_AGENT' },
      { input: '轉人工', expectedIntent: 'TRANSFER_AGENT' },
    ],
  },

  // 其他
  FAQ_GENERAL: {
    name: '一般FAQ',
    cases: [
      { input: '改票費用多少', expectedIntent: 'FAQ_GENERAL' },
      { input: '開票期限是幾天', expectedIntent: 'FAQ_GENERAL' },
      { input: '你們營業時間是幾點', expectedIntent: 'FAQ_GENERAL' },
    ],
  },
};

// 對話流程測試
const conversationFlowTests = [
  {
    name: '訂票完整流程',
    sessionId: 'flow-booking-001',
    steps: [
      { input: '你好', checkIntent: 'GREETING' },
      { input: '我想訂3月26日去東京的機票', checkIntent: 'TICKET_BOOK', checkEntities: ['date', 'destination'] },
      { input: '兩位大人', checkIntent: 'PASSENGER_INFO' },
      { input: '經濟艙靠窗', checkIntent: 'SEAT_REQUEST', checkEntities: ['seat_preference'] },
    ],
  },
  {
    name: '改票流程',
    sessionId: 'flow-change-001',
    steps: [
      { input: 'BTE2500208 我要改票', checkIntent: 'TICKET_CHANGE', checkEntities: ['booking_ref'] },
      { input: '回程改到4月15日', checkIntent: 'TICKET_CHANGE', checkEntities: ['date', 'direction'] },
    ],
  },
  {
    name: '簽證諮詢流程',
    sessionId: 'flow-visa-001',
    steps: [
      { input: '去泰國要簽證嗎', checkIntent: 'VISA_INQUIRY', checkEntities: ['destination'] },
      { input: '那台胞證要幾天', checkIntent: 'VISA_INQUIRY' },
    ],
  },
  {
    name: '付款流程',
    sessionId: 'flow-payment-001',
    steps: [
      { input: '我要付款', checkIntent: 'PAYMENT_REQUEST' },
      { input: '統編 12345678', checkIntent: 'RECEIPT_REQUEST', checkEntities: ['tax_id'] },
    ],
  },
];

// ============ 測試執行函數 ============

async function callChatAPI(message, sessionId = 'test') {
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runIntentTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 意圖分類測試');
  console.log('='.repeat(70));
  console.log(`📍 測試目標: ${BASE_URL}`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  for (const [intentCode, intentData] of Object.entries(intentTestCases)) {
    console.log(`\n📌 測試意圖: ${intentCode} (${intentData.name})`);
    console.log('-'.repeat(50));

    for (const testCase of intentData.cases) {
      results.total++;

      const result = await callChatAPI(testCase.input, `test-${intentCode}-${results.total}`);

      const isCorrect = result.success && result.intent === testCase.expectedIntent;

      if (isCorrect) {
        results.passed++;
        console.log(`  ✅ "${testCase.input}"`);
        console.log(`     → ${result.intent} (${(result.confidence * 100).toFixed(0)}%)`);
      } else {
        results.failed++;
        console.log(`  ❌ "${testCase.input}"`);
        console.log(`     預期: ${testCase.expectedIntent}`);
        console.log(`     實際: ${result.intent || result.error}`);

        results.details.push({
          input: testCase.input,
          expected: testCase.expectedIntent,
          actual: result.intent || 'ERROR',
          error: result.error,
        });
      }

      // 避免速率限制
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return results;
}

async function runConversationFlowTests() {
  console.log('\n' + '='.repeat(70));
  console.log('💬 對話流程測試');
  console.log('='.repeat(70));

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  for (const flow of conversationFlowTests) {
    console.log(`\n📋 流程: ${flow.name}`);
    console.log('-'.repeat(50));

    let flowPassed = true;

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      results.total++;

      const result = await callChatAPI(step.input, flow.sessionId);

      // 檢查意圖
      const intentCorrect = !step.checkIntent || result.intent === step.checkIntent;

      // 檢查實體
      let entitiesCorrect = true;
      if (step.checkEntities && result.entities) {
        for (const entityKey of step.checkEntities) {
          // 檢查實體是否存在（不區分大小寫）
          const hasEntity = Object.keys(result.entities).some(
            key => key.toLowerCase() === entityKey.toLowerCase() ||
                   key.toLowerCase().includes(entityKey.toLowerCase())
          );
          if (!hasEntity) {
            entitiesCorrect = false;
            break;
          }
        }
      }

      const stepPassed = intentCorrect && entitiesCorrect;

      if (stepPassed) {
        results.passed++;
        console.log(`  ${i + 1}. ✅ "${step.input}"`);
        console.log(`     意圖: ${result.intent}`);
        if (Object.keys(result.entities || {}).length > 0) {
          console.log(`     實體: ${JSON.stringify(result.entities)}`);
        }
      } else {
        results.failed++;
        flowPassed = false;
        console.log(`  ${i + 1}. ❌ "${step.input}"`);
        if (!intentCorrect) {
          console.log(`     意圖錯誤: 預期 ${step.checkIntent}, 實際 ${result.intent}`);
        }
        if (!entitiesCorrect) {
          console.log(`     缺少實體: ${step.checkEntities?.join(', ')}`);
        }

        results.details.push({
          flow: flow.name,
          step: i + 1,
          input: step.input,
          expected: step.checkIntent,
          actual: result.intent,
        });
      }

      // 顯示回覆（截斷）
      if (result.reply) {
        const shortReply = result.reply.length > 60
          ? result.reply.substring(0, 60) + '...'
          : result.reply;
        console.log(`     回覆: ${shortReply}`);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`  流程結果: ${flowPassed ? '✅ 通過' : '❌ 失敗'}`);
  }

  return results;
}

async function runAllTests() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║        金龍永盛 AI 客服系統 - 整合測試報告                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\n📅 測試時間: ${new Date().toLocaleString('zh-TW')}`);

  // 1. 意圖分類測試
  const intentResults = await runIntentTests();

  // 2. 對話流程測試
  const flowResults = await runConversationFlowTests();

  // 3. 總結
  console.log('\n' + '='.repeat(70));
  console.log('📊 測試總結');
  console.log('='.repeat(70));

  const totalTests = intentResults.total + flowResults.total;
  const totalPassed = intentResults.passed + flowResults.passed;
  const totalFailed = intentResults.failed + flowResults.failed;
  const accuracy = ((totalPassed / totalTests) * 100).toFixed(1);

  console.log(`\n┌────────────────────┬─────────┬─────────┬─────────┐`);
  console.log(`│ 測試類型           │ 通過    │ 失敗    │ 準確率  │`);
  console.log(`├────────────────────┼─────────┼─────────┼─────────┤`);
  console.log(`│ 意圖分類測試       │ ${String(intentResults.passed).padStart(4)}    │ ${String(intentResults.failed).padStart(4)}    │ ${((intentResults.passed / intentResults.total) * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ 對話流程測試       │ ${String(flowResults.passed).padStart(4)}    │ ${String(flowResults.failed).padStart(4)}    │ ${((flowResults.passed / flowResults.total) * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`├────────────────────┼─────────┼─────────┼─────────┤`);
  console.log(`│ 總計               │ ${String(totalPassed).padStart(4)}    │ ${String(totalFailed).padStart(4)}    │ ${accuracy.padStart(5)}%  │`);
  console.log(`└────────────────────┴─────────┴─────────┴─────────┘`);

  // 失敗案例詳情
  if (intentResults.details.length > 0 || flowResults.details.length > 0) {
    console.log('\n❌ 失敗案例詳情:');
    console.log('-'.repeat(50));

    for (const detail of intentResults.details) {
      console.log(`  • "${detail.input}"`);
      console.log(`    預期: ${detail.expected}, 實際: ${detail.actual}`);
    }

    for (const detail of flowResults.details) {
      console.log(`  • [${detail.flow}] 步驟 ${detail.step}: "${detail.input}"`);
      console.log(`    預期: ${detail.expected}, 實際: ${detail.actual}`);
    }
  }

  console.log('\n✅ 測試完成！\n');

  return {
    intentResults,
    flowResults,
    summary: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      accuracy: parseFloat(accuracy),
    },
  };
}

// 執行測試
runAllTests().catch(console.error);
