/**
 * 金龍永盛 AI 客服系統 - FAQ 檢索模組
 *
 * 使用簡易的關鍵字匹配 + 語意相似度計算
 * 未來可升級為向量資料庫（Pinecone）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FAQ 資料結構
let faqData = [];

/**
 * 載入 FAQ 資料
 */
export async function loadFAQData() {
  const faqPath = path.join(__dirname, '../data/faq_knowledge_base.csv');

  try {
    const csvContent = fs.readFileSync(faqPath, 'utf-8');

    // 使用更強健的 CSV 解析（處理多行引號字段）
    const rows = parseCSVContent(csvContent);

    faqData = [];
    // 跳過標題行
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 5 && row[0]) {
        faqData.push({
          id: row[0],
          category: row[1],
          question: row[2],
          answer: row[3],
          keywords: row[4] ? row[4].split(' ') : [],
        });
      }
    }

    console.log(`✅ 已載入 ${faqData.length} 筆 FAQ 資料`);
    return faqData;
  } catch (error) {
    console.error('❌ 載入 FAQ 資料失敗:', error);
    return [];
  }
}

/**
 * 解析完整 CSV 內容（處理多行引號字段）
 */
function parseCSVContent(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // 轉義的引號
        currentField += '"';
        i++; // 跳過下一個引號
      } else if (char === '"') {
        // 結束引號
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        // 開始引號
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        if (char === '\r') i++; // 跳過 \r
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  // 處理最後一行
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * 簡易 CSV 行解析（處理引號內的逗號）
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * 搜尋相關 FAQ
 * @param {string} query - 用戶查詢
 * @param {number} maxResults - 最多返回幾筆
 * @returns {Array} 相關 FAQ 列表
 */
export function searchFAQ(query, maxResults = 3) {
  if (faqData.length === 0) {
    console.warn('⚠️ FAQ 資料尚未載入');
    return [];
  }

  const queryLower = query.toLowerCase();
  const queryKeywords = extractKeywords(query);

  // 計算每個 FAQ 的相關性分數
  const scored = faqData.map(faq => {
    let score = 0;

    // 1. 問題完全匹配
    if (faq.question.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // 2. 關鍵字匹配
    faq.keywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 3;
      }
    });

    // 3. 查詢關鍵字在問題中出現
    queryKeywords.forEach(keyword => {
      if (faq.question.toLowerCase().includes(keyword)) {
        score += 2;
      }
      if (faq.answer.toLowerCase().includes(keyword)) {
        score += 1;
      }
    });

    // 4. 類別匹配
    const categoryKeywords = {
      '機票服務': ['機票', '訂票', '改票', '退票', '開票', '航班'],
      '簽證護照': ['簽證', '護照', '台胞證', '免簽', '入境'],
      '付款收據': ['付款', '刷卡', '收據', '發票', '統編'],
      '旅遊安全': ['旅遊警示', '紅色', '危險', '安全', '緊急'],
      '服務資訊': ['服務時間', '營業', '聯絡', '電話'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (faq.category === category) {
        keywords.forEach(kw => {
          if (queryLower.includes(kw)) {
            score += 2;
          }
        });
      }
    }

    return { ...faq, score };
  });

  // 排序並返回前 N 筆
  return scored
    .filter(faq => faq.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * 從查詢中提取關鍵字
 */
function extractKeywords(query) {
  // 常見停用詞
  const stopWords = ['的', '是', '在', '有', '嗎', '呢', '啊', '要', '我', '你', '可以', '請問', '想', '怎麼', '什麼', '多少'];

  // 移除標點符號並分詞
  const cleaned = query.replace(/[，。？！、：；""''（）【】]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);

  // 過濾停用詞
  return words.filter(w => !stopWords.includes(w) && w.length > 1);
}

/**
 * 格式化 FAQ 為上下文
 */
export function formatFAQContext(faqs) {
  if (faqs.length === 0) {
    return '（沒有找到相關的 FAQ）';
  }

  return faqs.map((faq, index) => {
    return `【FAQ ${index + 1}】
分類：${faq.category}
問題：${faq.question}
答案：${faq.answer}
---`;
  }).join('\n\n');
}

/**
 * 取得所有 FAQ 類別
 */
export function getCategories() {
  const categories = new Set(faqData.map(faq => faq.category));
  return Array.from(categories);
}

/**
 * 根據類別取得 FAQ
 */
export function getFAQByCategory(category) {
  return faqData.filter(faq => faq.category === category);
}

export default {
  loadFAQData,
  searchFAQ,
  formatFAQContext,
  getCategories,
  getFAQByCategory,
};
