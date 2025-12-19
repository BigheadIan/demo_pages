/**
 * 金龍永盛 AI 客服 - AI 回覆測試腳本
 * 測試各種意圖的 AI 回覆是否符合業務流程
 */

import { handleMessage } from './src/intentRouter.js';
import { initIntentClassifier } from './src/intentClassifier.js';
import { loadFAQData } from './src/faqRetriever.js';
import { initGemini } from './src/gemini.js';
import dotenv from 'dotenv';
dotenv.config();

// 測試案例 - 每種意圖選擇 1-2 個代表性測試
const testCases = [
  // 機票服務類
  { category: '訂票請求', message: 'BTE2500208 請開票', checkFor: ['訂位', '確認', '開票'] },
  { category: '改票請求', message: '回程要改為3/26', checkFor: ['改票', '費用', '航班'] },
  { category: '退票請求', message: '要退票', checkFor: ['退票', '費用', '手續費'] },
  { category: '報價查詢', message: '去東京的機票多少錢', checkFor: ['價格', '報價', '費用'] },
  { category: '航班查詢', message: '早上有沒有飛香港的班機', checkFor: ['航班', '班機'] },
  { category: '訂位狀態', message: '機票收到了嗎', checkFor: ['訂位', '機票', '確認'] },

  // 簽證護照類
  { category: '簽證諮詢', message: '去泰國要簽證嗎', checkFor: ['簽證', '泰國', '免簽'] },
  { category: '簽證進度', message: '台胞證辦好了嗎', checkFor: ['進度', '工作天', '辦理'] },

  // 付款收據類
  { category: '付款請求', message: '怎麼付款', checkFor: ['付款', '刷卡', '匯款'] },
  { category: '收據請求', message: '請給我收據', checkFor: ['收據', '發票', '統編'] },

  // 資訊提供類
  { category: '行李查詢', message: '可以帶幾公斤', checkFor: ['行李', '公斤', '託運'] },
  { category: '選位需求', message: '要靠窗', checkFor: ['座位', '靠窗', '選位'] },

  // 對話管理類
  { category: '問候', message: '您好', checkFor: ['您好', '服務', '協助'] },
  { category: '轉人工', message: '我要找真人', checkFor: ['客服', '人工', '轉接'] },
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

async function runResponseTests() {
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.cyan}金龍永盛 AI 客服 - AI 回覆內容測試${colors.reset}`);
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

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n${colors.blue}【${test.category}】${colors.reset}`);
    console.log(`📝 用戶: "${test.message}"`);

    try {
      const result = await handleMessage(test.message, `test-${Date.now()}`);

      console.log(`🤖 AI 回覆:`);
      console.log(`${colors.dim}${result.reply}${colors.reset}`);

      // 檢查回覆是否包含預期關鍵字
      const responseText = (result.reply || '').toLowerCase();
      const foundKeywords = test.checkFor.filter(kw =>
        responseText.includes(kw.toLowerCase())
      );
      const missingKeywords = test.checkFor.filter(kw =>
        !responseText.includes(kw.toLowerCase())
      );

      if (foundKeywords.length > 0) {
        passed++;
        console.log(`${colors.green}✓ 回覆包含關鍵字: ${foundKeywords.join(', ')}${colors.reset}`);
      } else {
        failed++;
        console.log(`${colors.red}✗ 回覆缺少預期關鍵字: ${test.checkFor.join(', ')}${colors.reset}`);
      }

      // 顯示額外資訊
      if (result.intent) {
        console.log(`${colors.dim}  意圖: ${result.intent}${colors.reset}`);
      }
      if (result.requiresHuman) {
        console.log(`${colors.yellow}  ⚠ 需要人工處理${colors.reset}`);
      }

    } catch (error) {
      failed++;
      console.log(`${colors.red}✗ 錯誤: ${error.message}${colors.reset}`);
    }

    console.log('-'.repeat(70));
  }

  // 總結
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.cyan}測試結果摘要${colors.reset}`);
  console.log('='.repeat(70));
  console.log(`總測試數: ${testCases.length}`);
  console.log(`${colors.green}通過: ${passed}${colors.reset}`);
  console.log(`${colors.red}失敗: ${failed}${colors.reset}`);
  console.log(`準確率: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log('\n');
}

runResponseTests().catch(console.error);
