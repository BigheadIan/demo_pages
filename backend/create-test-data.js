/**
 * 创建测试对话数据
 * 在服务器进程中运行，使用相同的数据库连接
 */

// 这个脚本需要通过 import 使用已初始化的 prisma
import { prisma } from './src/db.js';

const REGION_ID = '8b54dc33-c7b0-4a8c-a85f-b860e800790a'; // 台北總部
const AGENT_ID = '842bb352-757a-4423-8097-dd515edb3a14';  // 管理员

async function createTestData() {
  console.log('📝 创建测试数据...\n');

  try {
    // 1. 创建测试客户
    console.log('1. 创建测试客户...');
    const timestamp = Date.now();
    const customer = await prisma.customer.create({
      data: {
        regionId: REGION_ID,
        source: 'LINE',
        sourceUserId: 'U_test_' + timestamp,
        displayName: '测试客户_王小明',
        avatarUrl: 'https://profile.line-scdn.net/test',
        vipLevel: 2,
        notes: 'Test customer'
      }
    });
    console.log('   客户 ID:', customer.id);
    console.log('   客户名称:', customer.displayName);

    // 2. 创建对话
    console.log('\n2. 创建测试对话...');
    const conversation = await prisma.conversation.create({
      data: {
        customerId: customer.id,
        regionId: REGION_ID,
        source: 'LINE',
        sourceUserId: customer.sourceUserId,
        status: 'ASSIGNED',
        assignedAgentId: AGENT_ID,
        priority: 3,
        messageCount: 3,
        lastMessageAt: new Date()
      }
    });
    console.log('   对话 ID:', conversation.id);
    console.log('   状态:', conversation.status);

    // 3. 添加消息
    console.log('\n3. 添加测试消息...');

    // 消息 1: 客户询问
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'CUSTOMER',
        contentType: 'TEXT',
        content: '你好，我想询问一下去日本东京的机票价格',
        createdAt: new Date(Date.now() - 120000) // 2分钟前
      }
    });
    console.log('   [客户] 你好，我想询问一下去日本东京的机票价格');

    // 消息 2: AI 回复
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'BOT',
        contentType: 'TEXT',
        content: '您好！感谢您的询问。请问您预计什么时间出发？几位旅客？需要商务舱还是经济舱呢？',
        createdAt: new Date(Date.now() - 60000) // 1分钟前
      }
    });
    console.log('   [AI] 您好！感谢您的询问...');

    // 消息 3: 客户最新消息
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'CUSTOMER',
        contentType: 'TEXT',
        content: '预计下个月15号出发，2个人，经济舱就好。另外想问一下改票需要多少钱？',
        createdAt: new Date()
      }
    });
    console.log('   [客户] 预计下个月15号出发，2个人，经济舱就好。另外想问一下改票需要多少钱？');

    console.log('\n✅ 测试数据创建完成！');
    console.log('\n📋 汇总:');
    console.log('   客户 ID:', customer.id);
    console.log('   对话 ID:', conversation.id);
    console.log('   状态: ASSIGNED (已接手)');
    console.log('   消息数: 3');

    console.log('\n🔗 测试命令:');
    console.log('   获取 AI 推荐回覆:');
    console.log('   curl http://localhost:3001/api/agent/conversation/' + conversation.id + '/suggested-reply -H "Authorization: Bearer TOKEN"');

    return { customerId: customer.id, conversationId: conversation.id };

  } catch (error) {
    console.error('❌ 创建失败:', error.message);
    throw error;
  }
}

createTestData()
  .then(result => {
    console.log('\n✅ 完成');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
