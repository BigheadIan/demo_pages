/**
 * 金龍永盛 AI 客服系統 - Gemini API 整合
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';
import { FAQ_SYSTEM_PROMPT, FAQ_RETRIEVAL_PROMPT, INTENT_CLASSIFICATION_PROMPT } from './prompts.js';
import { searchFAQ, formatFAQContext } from './faqRetriever.js';

let genAI = null;
let model = null;

/**
 * 初始化 Gemini API
 */
export function initGemini() {
  if (!config.gemini.apiKey) {
    console.error('❌ GEMINI_API_KEY 未設定');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    model = genAI.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: FAQ_SYSTEM_PROMPT,
    });
    console.log(`✅ Gemini API 初始化成功（模型：${config.gemini.model}）`);
    return true;
  } catch (error) {
    console.error('❌ Gemini API 初始化失敗:', error);
    return false;
  }
}

/**
 * FAQ 自動回覆
 * @param {string} userMessage - 用戶訊息
 * @returns {Object} 回覆結果
 */
export async function faqAutoReply(userMessage) {
  if (!model) {
    throw new Error('Gemini API 尚未初始化');
  }

  const startTime = Date.now();

  try {
    // 1. 搜尋相關 FAQ
    const relevantFAQs = searchFAQ(userMessage, config.faq.maxResults);
    const faqContext = formatFAQContext(relevantFAQs);

    // 2. 構建 Prompt
    const prompt = FAQ_RETRIEVAL_PROMPT
      .replace('{faq_context}', faqContext)
      .replace('{user_question}', userMessage);

    // 3. 呼叫 Gemini API
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: config.response.temperature,
        maxOutputTokens: config.response.maxLength,
      },
    });

    const response = result.response;
    const reply = response.text();

    // 4. 計算處理時間和 token 使用
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // 估算 token 使用量（簡易估算：中文約 2 字符/token）
    const inputTokens = Math.ceil((prompt.length + FAQ_SYSTEM_PROMPT.length) / 2);
    const outputTokens = Math.ceil(reply.length / 2);

    return {
      success: true,
      reply: reply.trim(),
      metadata: {
        matchedFAQs: relevantFAQs.map(f => ({
          id: f.id,
          question: f.question,
          score: f.score,
        })),
        processingTime,
        tokenUsage: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        model: config.gemini.model,
      },
    };
  } catch (error) {
    console.error('❌ FAQ 回覆生成失敗:', error);
    return {
      success: false,
      reply: '抱歉，目前系統忙碌中，請稍後再試或聯繫人工客服。',
      error: error.message,
    };
  }
}

/**
 * 意圖分類（階段2使用）
 * @param {string} userMessage - 用戶訊息
 * @returns {Object} 分類結果
 */
export async function classifyIntent(userMessage) {
  if (!model) {
    throw new Error('Gemini API 尚未初始化');
  }

  try {
    const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{user_message}', userMessage);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,  // 分類任務用低溫度
        maxOutputTokens: 500,
      },
    });

    const response = result.response.text();

    // 解析 JSON 回覆
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        success: true,
        classification: JSON.parse(jsonMatch[0]),
      };
    }

    return {
      success: false,
      error: '無法解析分類結果',
      raw: response,
    };
  } catch (error) {
    console.error('❌ 意圖分類失敗:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 通用對話（無 FAQ 限制）
 * @param {string} userMessage - 用戶訊息
 * @param {Array} history - 對話歷史
 * @returns {Object} 回覆結果
 */
export async function chat(userMessage, history = []) {
  if (!model) {
    throw new Error('Gemini API 尚未初始化');
  }

  try {
    // 構建對話歷史
    const contents = [
      ...history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const result = await model.generateContent({
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: config.response.maxLength,
      },
    });

    return {
      success: true,
      reply: result.response.text().trim(),
    };
  } catch (error) {
    console.error('❌ 對話生成失敗:', error);
    return {
      success: false,
      reply: '抱歉，目前系統忙碌中，請稍後再試。',
      error: error.message,
    };
  }
}

/**
 * 估算費用（Gemini 2.0 Flash）
 */
export function estimateCost(inputTokens, outputTokens) {
  // Gemini 2.0 Flash 定價：$0.10/M 輸入，$0.40/M 輸出
  const inputCost = (inputTokens / 1000000) * 0.10;
  const outputCost = (outputTokens / 1000000) * 0.40;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
  };
}

export default {
  initGemini,
  faqAutoReply,
  classifyIntent,
  chat,
  estimateCost,
};
