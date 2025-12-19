/**
 * 文件上傳路由
 * 金龍永盛客服管理後台
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// 確保上傳目錄存在
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存儲
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一檔名：時間戳-隨機字串.副檔名
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// 文件過濾器
const fileFilter = (req, file, cb) => {
  // 允許的文件類型
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedDocTypes = ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  const allowedTypes = [...allowedImageTypes, ...allowedDocTypes];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`不支援的文件類型: ${file.mimetype}`), false);
  }
};

// 創建 multer 實例
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  },
  fileFilter,
});

/**
 * POST /api/upload
 * 上傳單個文件
 */
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '沒有上傳文件',
      });
    }

    // 構建文件 URL
    const protocol = req.protocol;
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    // 判斷是圖片還是文件
    const isImage = req.file.mimetype.startsWith('image/');

    res.json({
      success: true,
      data: {
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        isImage,
      },
    });

    console.log(`📎 文件上傳成功: ${req.file.originalname} -> ${req.file.filename}`);
  } catch (error) {
    console.error('❌ 文件上傳失敗:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 錯誤處理中間件
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: '文件大小超過限制（最大 10MB）',
      });
    }
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  next();
});

export default router;
