import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { generateToken, authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { registerSchema, loginSchema, emailSchema } from '../utils/validation';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// 注册
router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  
  // 检查邮箱是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });
  
  if (existingUser) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }
  
  // 哈希密码
  const passwordHash = await hashPassword(data.password);
  
  // 创建用户
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });
  
  // 生成 Token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as any,
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      detail: { method: 'register' },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.success({ user, token });
}));

// 登录
router.post('/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  
  // 查找用户
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });
  
  if (!user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }
  
  // 检查是否被锁定
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(`Account locked. Try again in ${minutes} minutes`, 423, 'ACCOUNT_LOCKED');
  }
  
  // 验证密码
  const isValid = await verifyPassword(data.password, user.passwordHash);
  
  if (!isValid) {
    // 增加失败次数
    const failedCount = user.failedLoginCount + 1;
    const updateData: any = { failedLoginCount: failedCount };
    
    // 连续失败 5 次锁定 15 分钟
    if (failedCount >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      updateData.failedLoginCount = 0;
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
    
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }
  
  // 登录成功，重置失败次数
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
  
  // 生成 Token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as any,
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      detail: { method: 'password' },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.success({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    token,
  });
}));

// 检查邮箱是否已注册
router.get('/check-email', asyncHandler(async (req, res) => {
  const email = emailSchema.parse(req.query.email);
  
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  
  res.success({ exists: !!existing });
}));

// 获取当前用户信息（需要认证）
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      notifyEmailEnabled: true,
      notifyBeforeDays: true,
      createdAt: true,
    },
  });
  
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  
  res.success({ user });
}));

export default router;
