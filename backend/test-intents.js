/**
 * 金龍永盛 AI 客服 - 意圖辨識測試腳本
 * 測試各種意圖分類和 AI 回覆是否符合預期
 */

import { classifyIntent, initIntentClassifier } from './src/intentClassifier.js';
import { handleMessage } from './src/intentRouter.js';
import { extractAllEntities, flattenEntities } from './src/entityExtractor.js';
import { searchFAQ, loadFAQData } from './src/faqRetriever.js';
import { initGemini } from './src/gemini.js';
import dotenv from 'dotenv';
dotenv.config();

// 測試案例定義
const testCases = [
  // ==================== 機票服務類 ====================
  {
    category: '機票服務',
    intent: 'TICKET_BOOK',
    name: '訂票請求',
    tests: [
      { message: '請幫我訂票', expectedIntent: 'TICKET_BOOK' },
      { message: '可以開票了', expectedIntent: 'TICKET_BOOK' },
      { message: 'BTE2500208 請開票', expectedIntent: 'TICKET_BOOK', expectedEntities: ['BOOKING_REF'] },
      { message: '兩位歐洲行程可以開票了', expectedIntent: 'TICKET_BOOK' },
      { message: '麻煩訂位', expectedIntent: 'TICKET_BOOK' },
    ]
  },
  {
    category: '機票服務',
    intent: 'TICKET_CHANGE',
    name: '改票請求',
    tests: [
      { message: '班機要修改', expectedIntent: 'TICKET_CHANGE' },
      { message: '回程要改為3/26', expectedIntent: 'TICKET_CHANGE', expectedEntities: ['DATE', 'DIRECTION'] },
      { message: '改票', expectedIntent: 'TICKET_CHANGE' },
      { message: '請幫我改成CX472', expectedIntent: 'TICKET_CHANGE', expectedEntities: ['FLIGHT_NO'] },
      { message: '想改晚一點的班機', expectedIntent: 'TICKET_CHANGE' },
      { message: '升等到商務艙', expectedIntent: 'TICKET_CHANGE', expectedEntities: ['CLASS'] },
    ]
  },
  {
    category: '機票服務',
    intent: 'TICKET_CANCEL',
    name: '退票請求',
    tests: [
      { message: '要退票', expectedIntent: 'TICKET_CANCEL' },
      { message: '取消這個訂位', expectedIntent: 'TICKET_CANCEL' },
      { message: '不去了，要退掉', expectedIntent: 'TICKET_CANCEL' },
      { message: '行程取消', expectedIntent: 'TICKET_CANCEL' },
      { message: '這張票可以退嗎', expectedIntent: 'TICKET_CANCEL' },
    ]
  },
  {
    category: '機票服務',
    intent: 'QUOTE_REQUEST',
    name: '報價查詢',
    tests: [
      { message: '這個票價多少', expectedIntent: 'QUOTE_REQUEST' },
      { message: '請報價', expectedIntent: 'QUOTE_REQUEST' },
      { message: '費用是多少', expectedIntent: 'QUOTE_REQUEST' },
      { message: '商務艙多少錢', expectedIntent: 'QUOTE_REQUEST', expectedEntities: ['CLASS'] },
      { message: '去東京的機票多少錢', expectedIntent: 'QUOTE_REQUEST', expectedEntities: ['DESTINATION'] },
    ]
  },
  {
    category: '機票服務',
    intent: 'FLIGHT_QUERY',
    name: '航班查詢',
    tests: [
      { message: '請給我航班時間', expectedIntent: 'FLIGHT_QUERY' },
      { message: '有什麼航班可以選', expectedIntent: 'FLIGHT_QUERY' },
      { message: '當天有幾班', expectedIntent: 'FLIGHT_QUERY' },
      { message: '這班機位還有嗎', expectedIntent: 'FLIGHT_QUERY' },
      { message: '早上有沒有飛香港的班機', expectedIntent: 'FLIGHT_QUERY', expectedEntities: ['DESTINATION', 'TIME_PREFERENCE'] },
    ]
  },
  {
    category: '機票服務',
    intent: 'BOOKING_STATUS',
    name: '訂位狀態查詢',
    tests: [
      { message: '請問我有訂票嗎', expectedIntent: 'BOOKING_STATUS' },
      { message: '機票收到了嗎', expectedIntent: 'BOOKING_STATUS' },
      { message: '訂位確認了沒', expectedIntent: 'BOOKING_STATUS' },
      { message: '電子機票寄了嗎', expectedIntent: 'BOOKING_STATUS' },
      { message: '幫我確認一下行程', expectedIntent: 'BOOKING_STATUS' },
    ]
  },

  // ==================== 簽證護照類 ====================
  {
    category: '簽證護照',
    intent: 'VISA_INQUIRY',
    name: '簽證諮詢',
    tests: [
      { message: '去泰國要簽證嗎', expectedIntent: 'VISA_INQUIRY', expectedEntities: ['DESTINATION'] },
      { message: '辦台胞證需要什麼', expectedIntent: 'VISA_INQUIRY' },
      { message: '馬來西亞免簽嗎', expectedIntent: 'VISA_INQUIRY', expectedEntities: ['DESTINATION'] },
      { message: '印度簽證怎麼辦', expectedIntent: 'VISA_INQUIRY', expectedEntities: ['DESTINATION'] },
      { message: '護照要準備什麼資料', expectedIntent: 'VISA_INQUIRY' },
      { message: '入境卡怎麼填', expectedIntent: 'VISA_INQUIRY' },
    ]
  },
  {
    category: '簽證護照',
    intent: 'VISA_PROGRESS',
    name: '簽證進度查詢',
    tests: [
      { message: '台胞證辦好了嗎', expectedIntent: 'VISA_PROGRESS' },
      { message: '護照進度如何', expectedIntent: 'VISA_PROGRESS' },
      { message: '什麼時候可以拿到', expectedIntent: 'VISA_PROGRESS' },
      { message: '簽證送件了嗎', expectedIntent: 'VISA_PROGRESS' },
    ]
  },

  // ==================== 付款收據類 ====================
  {
    category: '付款收據',
    intent: 'PAYMENT_REQUEST',
    name: '付款請求',
    tests: [
      { message: '給我刷卡連結', expectedIntent: 'PAYMENT_REQUEST' },
      { message: '要付款', expectedIntent: 'PAYMENT_REQUEST' },
      { message: '可以刷卡嗎', expectedIntent: 'PAYMENT_REQUEST' },
      { message: '付款方式', expectedIntent: 'PAYMENT_REQUEST' },
      { message: '怎麼付款', expectedIntent: 'PAYMENT_REQUEST' },
    ]
  },
  {
    category: '付款收據',
    intent: 'RECEIPT_REQUEST',
    name: '收據請求',
    tests: [
      { message: '請給我收據', expectedIntent: 'RECEIPT_REQUEST' },
      { message: '需要發票', expectedIntent: 'RECEIPT_REQUEST' },
      { message: '代轉收據', expectedIntent: 'RECEIPT_REQUEST' },
      { message: '統編開立', expectedIntent: 'RECEIPT_REQUEST' },
    ]
  },

  // ==================== 資訊提供類 ====================
  {
    category: '資訊提供',
    intent: 'PASSENGER_INFO',
    name: '旅客資料',
    tests: [
      { message: '護照資料如下', expectedIntent: 'PASSENGER_INFO' },
      { message: '英文名是 CHEN MING-HUA', expectedIntent: 'PASSENGER_INFO', expectedEntities: ['PASSENGER_NAME'] },
      { message: '生日是 1990/01/15', expectedIntent: 'PASSENGER_INFO', expectedEntities: ['DATE'] },
    ]
  },
  {
    category: '資訊提供',
    intent: 'BAGGAGE_INQUIRY',
    name: '行李查詢',
    tests: [
      { message: '可以帶幾公斤', expectedIntent: 'BAGGAGE_INQUIRY' },
      { message: '行李超重怎麼辦', expectedIntent: 'BAGGAGE_INQUIRY' },
      { message: '商務艙行李額度', expectedIntent: 'BAGGAGE_INQUIRY', expectedEntities: ['CLASS'] },
      { message: '可以帶兩件嗎', expectedIntent: 'BAGGAGE_INQUIRY' },
    ]
  },
  {
    category: '資訊提供',
    intent: 'SEAT_REQUEST',
    name: '選位需求',
    tests: [
      { message: '要靠窗', expectedIntent: 'SEAT_REQUEST', expectedEntities: ['SEAT_PREFERENCE'] },
      { message: '靠走道的位子', expectedIntent: 'SEAT_REQUEST', expectedEntities: ['SEAT_PREFERENCE'] },
      { message: '想坐前面', expectedIntent: 'SEAT_REQUEST' },
      { message: '可以幫我選位嗎', expectedIntent: 'SEAT_REQUEST' },
    ]
  },

  // ==================== 對話管理類 ====================
  {
    category: '對話管理',
    intent: 'GREETING',
    name: '問候閒聊',
    tests: [
      { message: '早安', expectedIntent: 'GREETING' },
      { message: '您好', expectedIntent: 'GREETING' },
      { message: '謝謝', expectedIntent: 'GREETING' },
      { message: '辛苦了', expectedIntent: 'GREETING' },
      { message: '收到', expectedIntent: 'GREETING' },
      { message: '好的', expectedIntent: 'GREETING' },
    ]
  },
  {
    category: '對話管理',
    intent: 'TRANSFER_AGENT',
    name: '轉人工',
    tests: [
      { message: '方便通話嗎', expectedIntent: 'TRANSFER_AGENT' },
      { message: '可以打給我嗎', expectedIntent: 'TRANSFER_AGENT' },
      { message: '我要找真人', expectedIntent: 'TRANSFER_AGENT' },
      { message: '請客服打給我', expectedIntent: 'TRANSFER_AGENT' },
      { message: '這個太複雜了', expectedIntent: 'TRANSFER_AGENT' },
    ]
  },
];

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

// 主測試函數
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}金龍永盛 AI 客服 - 意圖辨識測試${colors.reset}`);
  console.log('='.repeat(60) + '\n');

  // 初始化
  console.log('正在初始化...');
  initGemini();
  initIntentClassifier();
  await loadFAQData();
  console.log('初始化完成！\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = [];

  for (const category of testCases) {
    console.log(`\n${colors.blue}【${category.category}】${category.name} (${category.intent})${colors.reset}`);
    console.log('-'.repeat(50));

    for (const test of category.tests) {
      totalTests++;

      try {
        // 測試意圖分類
        const intentResult = await classifyIntent(test.message);
        const actualIntent = intentResult.intent;
        const intentMatch = actualIntent === test.expectedIntent;

        // 測試實體抽取
        const rawEntities = extractAllEntities(test.message);
        const entities = flattenEntities(rawEntities);
        let entityMatch = true;
        let missingEntities = [];

        if (test.expectedEntities) {
          for (const expectedEntity of test.expectedEntities) {
            if (!entities[expectedEntity] && !entities[expectedEntity.toLowerCase()]) {
              entityMatch = false;
              missingEntities.push(expectedEntity);
            }
          }
        }

        // 測試意圖路由回覆
        const routeResult = await handleMessage(test.message, `test-${Date.now()}`);

        const passed = intentMatch;

        if (passed) {
          passedTests++;
          console.log(`${colors.green}✓${colors.reset} "${test.message}"`);
          console.log(`  ${colors.dim}意圖: ${actualIntent} | 信心度: ${(intentResult.confidence * 100).toFixed(0)}%${colors.reset}`);

          if (Object.keys(entities).length > 0) {
            const entityStr = Object.entries(entities)
              .filter(([k, v]) => v)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            if (entityStr) {
              console.log(`  ${colors.dim}實體: ${entityStr}${colors.reset}`);
            }
          }

          if (!entityMatch) {
            console.log(`  ${colors.yellow}⚠ 缺少預期實體: ${missingEntities.join(', ')}${colors.reset}`);
          }
        } else {
          failedTests.push({
            message: test.message,
            expected: test.expectedIntent,
            actual: actualIntent,
            confidence: intentResult.confidence,
          });
          console.log(`${colors.red}✗${colors.reset} "${test.message}"`);
          console.log(`  ${colors.red}預期: ${test.expectedIntent} | 實際: ${actualIntent} (${(intentResult.confidence * 100).toFixed(0)}%)${colors.reset}`);
        }

        // 顯示 AI 回覆摘要
        if (routeResult.message) {
          const shortReply = routeResult.message.length > 60
            ? routeResult.message.substring(0, 60) + '...'
            : routeResult.message;
          console.log(`  ${colors.dim}回覆: ${shortReply}${colors.reset}`);
        }

      } catch (error) {
        failedTests.push({
          message: test.message,
          expected: test.expectedIntent,
          actual: 'ERROR',
          error: error.message,
        });
        console.log(`${colors.red}✗${colors.reset} "${test.message}"`);
        console.log(`  ${colors.red}錯誤: ${error.message}${colors.reset}`);
      }
    }
  }

  // 測試 FAQ 檢索
  console.log(`\n${colors.blue}【FAQ 知識庫測試】${colors.reset}`);
  console.log('-'.repeat(50));

  const faqTestQueries = [
    '改票費用多少',
    '台胞證要幾天',
    '泰國簽證怎麼辦',
    '營業時間',
    '刷卡付款',
  ];

  for (const query of faqTestQueries) {
    const faqs = searchFAQ(query);
    if (faqs.length > 0) {
      console.log(`${colors.green}✓${colors.reset} "${query}" → 找到 ${faqs.length} 則相關 FAQ`);
      console.log(`  ${colors.dim}最佳匹配: ${faqs[0].question}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠${colors.reset} "${query}" → 未找到相關 FAQ`);
    }
  }

  // 總結報告
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.cyan}測試結果摘要${colors.reset}`);
  console.log('='.repeat(60));
  console.log(`總測試數: ${totalTests}`);
  console.log(`${colors.green}通過: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}失敗: ${failedTests.length}${colors.reset}`);
  console.log(`準確率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests.length > 0) {
    console.log(`\n${colors.red}失敗的測試案例:${colors.reset}`);
    for (const fail of failedTests) {
      console.log(`  - "${fail.message}"`);
      console.log(`    預期: ${fail.expected} | 實際: ${fail.actual}`);
      if (fail.error) {
        console.log(`    錯誤: ${fail.error}`);
      }
    }
  }

  console.log('\n');
}

// 執行測試
runTests().catch(console.error);
