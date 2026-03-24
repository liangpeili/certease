import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler';
import { responseFormatter } from './middleware/responseFormatter';
import { requestLogger } from './middleware/requestLogger';
import { authenticate } from './middleware/auth';

// 路由
import authRoutes from './routes/auth';
import dnsCredentialRoutes from './routes/dnsCredentials';
import certificateRoutes from './routes/certificates';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// 请求日志
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(requestLogger);

// 解析请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 响应格式化
app.use(responseFormatter);

// 健康检查
app.get('/health', (req, res) => {
  res.success({ status: 'ok', timestamp: new Date().toISOString() });
});

// 公开路由
app.use('/api/auth', authRoutes);

// 需要认证的路由
app.use('/api/dns-credentials', authenticate, dnsCredentialRoutes);
app.use('/api/certificates', authenticate, certificateRoutes);

// 404 处理
app.use((req, res) => {
  res.error('NOT_FOUND', 'Resource not found', 404);
});

// 错误处理
app.use(errorHandler);

export { app, PORT };
