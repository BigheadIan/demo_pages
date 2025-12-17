/**
 * 金龍永盛 AI 客服系統 - 測試腳本
 *
 * 測試 FAQ 檢索、Gemini API 回覆、意圖分類和實體提取功能
 */
import { loadFAQData, searchFAQ, formatFAQContext, getCategories } from './faqRetriever.js';
import { initGemini, faqAutoReply, classifyIntent as geminiClassifyIntent, estimateCost } from './gemini.js';
import { initIntentClassifier, classifyIntent, INTENTS } from './intentClassifier.js';
import { extractAllEntities, extractDates, extractFlightNumbers, extractDestinations, flattenEntities } from './entityExtractor.js';

// 測試用例
const testCases = [
  // 機票服務
  { question: '改票要多少錢？', expectedCategory: '機票服務' },
  { question: '訂機票需要什麼資料？', expectedCategory: '機票服務' },
  { question: '機票可以退嗎？', expectedCategory: '機票服務' },
  { question: '開票期限是多久？', expectedCategory: '機票服務' },

  // 簽證護照
  { question: '台胞證要幾天？', expectedCategory: '簽證護照' },
  { question: '去泰國要簽證嗎？', expectedCategory: '簽證護照' },
  { question: '申根國家可以待多久？', expectedCategory: '簽證護照' },
  { question: '馬來西亞入境卡怎麼辦？', expectedCategory: '簽證護照' },

  // 付款收據
  { question: '可以刷卡嗎？', expectedCategory: '付款收據' },
  { question: '什麼時候可以拿到收據？', expectedCategory: '付款收據' },
  { question: '發票可以開公司抬頭嗎？', expectedCategory: '付款收據' },

  // 旅遊安全
  { question: '哪些國家有旅遊警示？', expectedCategory: '旅遊安全' },
  { question: '紅色警示的國家有哪些？', expectedCategory: '旅遊安全' },
  { question: '出國前要準備什麼？', expectedCategory: '旅遊安全' },

  // 服務資訊
  { question: '你們幾點下班？', expectedCategory: '服務資訊' },
  { question: '晚上有緊急狀況怎麼辦？', expectedCategory: '服務資訊' },

  // 邊界測試
  { question: '你好', expectedCategory: null },
  { question: '我想訂機票', expectedCategory: '機票服務' },
  { question: '請問一下', expectedCategory: null },
];

/**
 * 測試 FAQ 檢索功能
 */
async function testFAQRetrieval() {
  console.log('\n' + '='.repeat(60));
  console.log('📚 測試 FAQ 檢索功能');
  console.log('='.repeat(60));

  // 載入 FAQ 資料
  await loadFAQData();

  // 顯示類別
  const categories = getCategories();
  console.log(`\n📂 已載入類別: ${categories.join(', ')}`);

  // 測試每個用例
  let passed = 0;
  let failed = 0;

  console.log('\n測試結果：\n');

  for (const testCase of testCases) {
    const results = searchFAQ(testCase.question, 1);
    const topResult = results[0];

    const matchedCategory = topResult ? topResult.category : null;
    const isCorrect = matchedCategory === testCase.expectedCategory ||
                      (testCase.expectedCategory === null && !topResult);

    if (isCorrect) {
      passed++;
      console.log(`✅ "${testCase.question}"`);
      if (topResult) {
        console.log(`   → ${topResult.category} (分數: ${topResult.score})`);
      } else {
        console.log(`   → 無匹配（符合預期）`);
      }
    } else {
      failed++;
      console.log(`❌ "${testCase.question}"`);
      console.log(`   預期: ${testCase.expectedCategory || '無匹配'}`);
      console.log(`   實際: ${matchedCategory || '無匹配'}`);
    }
  }

  console.log('\n' + '-'.repeat(40));
  console.log(`總計: ${testCases.length} 測試`);
  console.log(`通過: ${passed} ✅`);
  console.log(`失敗: ${failed} ❌`);
  console.log(`準確率: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  return { passed, failed, total: testCases.length };
}

/**
 * 測試 Gemini API（需要 API Key）
 */
async function testGeminiAPI() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 測試 Gemini API 回覆功能');
  console.log('='.repeat(60));

  // 初始化 Gemini
  const isReady = initGemini();

  if (!isReady) {
    console.log('\n⚠️ 跳過 Gemini API 測試（未設定 GEMINI_API_KEY）');
    console.log('   請在 .env 文件中設定 GEMINI_API_KEY');
    return;
  }

  // 測試幾個問題
  const apiTestCases = [
    '改票需要多少費用？',
    '台胞證要幾天才能辦好？',
    '可以刷卡付款嗎？',
  ];

  for (const question of apiTestCases) {
    console.log(`\n📝 問題: ${question}`);
    console.log('-'.repeat(40));

    const result = await faqAutoReply(question);

    if (result.success) {
      console.log(`💬 回覆: ${result.reply}`);
      console.log(`\n📊 統計:`);
      console.log(`   - 處理時間: ${result.metadata.processingTime}ms`);
      console.log(`   - Token 使用: ${result.metadata.tokenUsage.total}`);
      console.log(`   - 匹配 FAQ: ${result.metadata.matchedFAQs.length} 筆`);

      // 估算費用
      const cost = estimateCost(
        result.metadata.tokenUsage.input,
        result.metadata.tokenUsage.output
      );
      console.log(`   - 估算費用: $${cost.totalCost.toFixed(6)} USD`);
    } else {
      console.log(`❌ 錯誤: ${result.error}`);
    }
  }
}

/**
 * 測試實體提取（不需要 API）
 */
function testEntityExtraction() {
  console.log('\n' + '='.repeat(60));
  console.log('📦 測試實體提取功能');
  console.log('='.repeat(60));

  const entityTestCases = [
    {
      text: 'CX472 3/26 去香港商務艙',
      expected: {
        flightNumbers: 1,
        dates: 1,
        destinations: 1,
        class: 'BUSINESS',
      },
    },
    {
      text: 'BTE2500208 請幫我改票，回程改為2025/04/15',
      expected: {
        bookingRefs: 1,
        dates: 1,
        direction: 'INBOUND',
      },
    },
    {
      text: '我要訂3月26日去東京的機票，靠窗座位',
      expected: {
        dates: 1,
        destinations: 1,
        seatPreference: 'WINDOW',
      },
    },
    {
      text: 'BR867 明天飛大阪經濟艙',
      expected: {
        flightNumbers: 1,
        destinations: 1,
        class: 'ECONOMY',
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of entityTestCases) {
    console.log(`\n📝 文字: "${testCase.text}"`);
    console.log('-'.repeat(40));

    const entities = extractAllEntities(testCase.text);
    const flat = flattenEntities(entities);

    console.log('提取結果:');
    if (entities.flightNumbers.length > 0) {
      console.log(`  航班: ${entities.flightNumbers.map(f => f.normalized).join(', ')}`);
    }
    if (entities.dates.length > 0) {
      console.log(`  日期: ${entities.dates.map(d => d.normalized).join(', ')}`);
    }
    if (entities.destinations.length > 0) {
      console.log(`  目的地: ${entities.destinations.map(d => d.normalized).join(', ')}`);
    }
    if (entities.bookingRefs.length > 0) {
      console.log(`  訂位代號: ${entities.bookingRefs.map(r => r.normalized).join(', ')}`);
    }
    if (entities.class) {
      console.log(`  艙等: ${entities.class.normalized}`);
    }
    if (entities.direction) {
      console.log(`  方向: ${entities.direction.normalized}`);
    }
    if (entities.seatPreference) {
      console.log(`  座位偏好: ${entities.seatPreference.normalized}`);
    }

    // 簡單驗證
    let testPassed = true;
    if (testCase.expected.flightNumbers !== undefined &&
        entities.flightNumbers.length !== testCase.expected.flightNumbers) {
      testPassed = false;
    }
    if (testCase.expected.dates !== undefined &&
        entities.dates.length !== testCase.expected.dates) {
      testPassed = false;
    }
    if (testCase.expected.class !== undefined &&
        entities.class?.normalized !== testCase.expected.class) {
      testPassed = false;
    }

    if (testPassed) {
      passed++;
      console.log('✅ 測試通過');
    } else {
      failed++;
      console.log('❌ 測試失敗');
    }
  }

  console.log('\n' + '-'.repeat(40));
  console.log(`實體提取測試: ${passed}/${entityTestCases.length} 通過`);

  return { passed, failed, total: entityTestCases.length };
}

/**
 * 測試意圖分類（需要 API Key）
 */
async function testIntentClassification() {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 測試意圖分類功能（Gemini 2.0 Flash）');
  console.log('='.repeat(60));

  // 初始化意圖分類器
  const isReady = initIntentClassifier();

  if (!isReady) {
    console.log('\n⚠️ 跳過意圖分類測試（未設定 GEMINI_API_KEY）');
    return;
  }

  const intentTestCases = [
    { message: '請幫我訂票', expectedIntent: 'TICKET_BOOK' },
    { message: 'BTE2500208 請開票', expectedIntent: 'TICKET_BOOK' },
    { message: '回程要改為3/26', expectedIntent: 'TICKET_CHANGE' },
    { message: '我要退票', expectedIntent: 'TICKET_CANCEL' },
    { message: '機票多少錢？', expectedIntent: 'QUOTE_REQUEST' },
    { message: '台胞證辦好了嗎？', expectedIntent: 'VISA_PROGRESS' },
    { message: '去泰國要簽證嗎？', expectedIntent: 'VISA_INQUIRY' },
    { message: '給我刷卡連結', expectedIntent: 'PAYMENT_REQUEST' },
    { message: '我需要收據', expectedIntent: 'RECEIPT_REQUEST' },
    { message: '可以帶幾公斤行李？', expectedIntent: 'BAGGAGE_INQUIRY' },
    { message: '要靠窗的位子', expectedIntent: 'SEAT_REQUEST' },
    { message: '你好', expectedIntent: 'GREETING' },
    { message: '找真人', expectedIntent: 'TRANSFER_AGENT' },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of intentTestCases) {
    console.log(`\n📝 訊息: "${testCase.message}"`);
    console.log(`   預期: ${testCase.expectedIntent}`);
    console.log('-'.repeat(40));

    try {
      const result = await classifyIntent(testCase.message);

      if (result.success) {
        const isCorrect = result.intent === testCase.expectedIntent;
        if (isCorrect) {
          passed++;
          console.log(`✅ 正確！識別為: ${result.intent}`);
        } else {
          failed++;
          console.log(`❌ 錯誤！識別為: ${result.intent}`);
        }
        console.log(`   信心度: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`   類別: ${result.category}`);
        console.log(`   處理時間: ${result.processingTime}ms`);

        if (Object.keys(result.entities).length > 0) {
          console.log(`   實體:`, result.entities);
        }
      } else {
        failed++;
        console.log(`❌ 分類失敗: ${result.error}`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ 錯誤: ${error.message}`);
    }

    // 避免觸發速率限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '-'.repeat(40));
  console.log(`意圖分類測試: ${passed}/${intentTestCases.length} 通過`);
  console.log(`準確率: ${((passed / intentTestCases.length) * 100).toFixed(1)}%`);

  return { passed, failed, total: intentTestCases.length };
}

/**
 * 主測試函數
 */
async function runTests() {
  console.log('\n🧪 金龍永盛 AI 客服系統 - 測試套件 v2.0');
  console.log('='.repeat(60));

  const results = {
    faqRetrieval: null,
    entityExtraction: null,
    geminiAPI: null,
    intentClassification: null,
  };

  // 1. 測試 FAQ 檢索
  results.faqRetrieval = await testFAQRetrieval();

  // 2. 測試實體提取（不需要 API）
  results.entityExtraction = testEntityExtraction();

  // 3. 測試 Gemini API（如果有設定）
  await testGeminiAPI();

  // 4. 測試意圖分類（需要 API）
  results.intentClassification = await testIntentClassification();

  // 總結
  console.log('\n' + '='.repeat(60));
  console.log('📊 測試總結');
  console.log('='.repeat(60));

  if (results.faqRetrieval) {
    console.log(`FAQ 檢索:      ${results.faqRetrieval.passed}/${results.faqRetrieval.total} 通過`);
  }
  if (results.entityExtraction) {
    console.log(`實體提取:      ${results.entityExtraction.passed}/${results.entityExtraction.total} 通過`);
  }
  if (results.intentClassification) {
    console.log(`意圖分類:      ${results.intentClassification.passed}/${results.intentClassification.total} 通過`);
  }

  console.log('\n✅ 測試完成！');
  console.log('='.repeat(60));
}

// 執行測試
runTests().catch(console.error);
