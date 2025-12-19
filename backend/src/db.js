/**
 * Prisma 資料庫連接
 * 金龍永盛客服管理後台
 *
 * 支援:
 * - 本地開發: 使用 DATABASE_URL 連接字串
 * - Cloud Run: 使用 Cloud SQL Unix Socket
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

// 建立 PostgreSQL 連接池設定
let poolConfig;

// 連線池通用設定（優化效能）
const poolOptions = {
  min: 2,                        // 最小連線數
  max: 10,                       // 最大連線數
  idleTimeoutMillis: 30000,      // 閒置連線保留 30 秒
  connectionTimeoutMillis: 5000, // 連線超時 5 秒
  allowExitOnIdle: false,        // 防止連線池過早關閉
};

if (process.env.CLOUD_SQL_CONNECTION_NAME) {
  // Cloud Run 環境 - 使用 Unix Socket 連接 Cloud SQL
  poolConfig = {
    ...poolOptions,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'golden_dragon',
    host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
  };
  console.log(`📦 使用 Cloud SQL 連接: ${process.env.CLOUD_SQL_CONNECTION_NAME}`);
} else {
  // 本地開發環境 - 使用連接字串
  poolConfig = {
    ...poolOptions,
    connectionString: process.env.DATABASE_URL,
  };
  console.log('📦 使用本地資料庫連接');
}

const pool = new Pool(poolConfig);

// 建立 Prisma 適配器
const adapter = new PrismaPg(pool);

// 建立 Prisma 客戶端實例
// Prisma 7.x 使用 adapter 模式
const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

// 優雅關閉連接
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  await pool.end();
});

export { prisma };
export default prisma;
