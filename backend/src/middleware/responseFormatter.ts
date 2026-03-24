import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

// 扩展 Express Response 类型
declare global {
  namespace Express {
    interface Response {
      success: <T>(data: T, meta?: ApiResponse<T>['meta']) => void;
      error: (code: string, message: string, statusCode?: number, details?: unknown) => void;
    }
  }
}

export function responseFormatter(req: Request, res: Response, next: NextFunction): void {
  /**
   * 发送成功响应
   */
  res.success = function<T>(data: T, meta?: ApiResponse<T>['meta']): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      meta,
    };
    this.json(response);
  };

  /**
   * 发送错误响应
   */
  res.error = function(code: string, message: string, statusCode: number = 400, details?: unknown): void {
    const response: ApiResponse = {
      success: false,
      error: { code, message },
    };
    if (details) {
      response.error!.details = details;
    }
    this.status(statusCode).json(response);
  };

  next();
}
