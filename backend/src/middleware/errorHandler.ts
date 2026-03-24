import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiResponse } from '../types';

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    
    const response: ApiResponse = {
      success: false,
      error: { code, message, details },
    };
    res.status(statusCode).json(response);
    return;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (err.name === 'PrismaClientKnownRequestError') {
    // Prisma 错误处理
    const prismaError = err as unknown as { code: string; meta?: { target?: string[] } };
    if (prismaError.code === 'P2002') {
      statusCode = 409;
      code = 'DUPLICATE_ENTRY';
      message = `Duplicate entry for field: ${prismaError.meta?.target?.join(', ') || 'unknown'}`;
    } else if (prismaError.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else if (prismaError.code === 'P2003') {
      statusCode = 409;
      code = 'FOREIGN_KEY_CONSTRAINT';
      message = 'Foreign key constraint failed';
    }
  }

  // 生产环境隐藏错误详情
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
  }

  const response: ApiResponse = {
    success: false,
    error: { code, message },
  };

  // 开发环境添加堆栈
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
    if (statusCode === 500) {
      (response.error as { details?: unknown }).details = err.stack;
    }
  }

  res.status(statusCode).json(response);
};

// 异步路由错误捕获包装器
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
