import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // 将 requestId 附加到响应头
  res.setHeader('X-Request-ID', requestId);
  
  // 记录请求开始
  console.log(`[${requestId}] ${req.method} ${req.path} - Start`);
  
  // 响应完成时记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const resetColor = '\x1b[0m';
    
    console.log(
      `[${requestId}] ${req.method} ${req.path} - ${statusColor}${status}${resetColor} - ${duration}ms`
    );
  });
  
  next();
}
