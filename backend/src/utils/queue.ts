import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 创建 Redis 连接配置
const redisConnection = {
  url: REDIS_URL,
};

// 证书续期队列
export const certificateRenewalQueue = new Queue('certificate-renewal', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5秒后开始，指数退避
    },
    removeOnComplete: {
      count: 100, // 保留最近 100 个完成的任务
    },
    removeOnFail: {
      count: 50, // 保留最近 50 个失败的任务
    },
  },
});

// 清理任务队列（处理残留 DNS 记录）
export const cleanupQueue = new Queue('cleanup', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'fixed',
      delay: 60000, // 1分钟后重试
    },
  },
});

// Webhook 推送队列
export const webhookQueue = new Queue('webhook', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000, // 10秒后开始
    },
    removeOnComplete: {
      count: 200,
    },
    removeOnFail: {
      count: 100,
    },
  },
});

// 队列管理函数
export async function addRenewalJob(certificateId: string, priority: number = 5): Promise<Job> {
  return certificateRenewalQueue.add(
    'renew-certificate',
    { certificateId },
    {
      jobId: `renew-${certificateId}`, // 去重
      priority,
      removeOnFail: false,
    }
  );
}

export async function addCleanupJob(data: { certificateId: string; domain: string; txtName: string; txtValue: string }): Promise<Job> {
  return cleanupQueue.add('cleanup-dns-record', data, {
    delay: 300000, // 5分钟后执行，以防万一 Worker 还在处理
  });
}

export async function addWebhookJob(data: {
  webhookConfigId: string;
  event: string;
  payload: Record<string, unknown>;
}): Promise<Job> {
  return webhookQueue.add('send-webhook', data);
}

// 获取队列状态
export async function getQueueStats() {
  const [renewalWaiting, renewalActive, renewalFailed] = await Promise.all([
    certificateRenewalQueue.getWaitingCount(),
    certificateRenewalQueue.getActiveCount(),
    certificateRenewalQueue.getFailedCount(),
  ]);

  return {
    renewal: {
      waiting: renewalWaiting,
      active: renewalActive,
      failed: renewalFailed,
    },
  };
}

// 优雅关闭
export async function closeQueues(): Promise<void> {
  await Promise.all([
    certificateRenewalQueue.close(),
    cleanupQueue.close(),
    webhookQueue.close(),
  ]);
}
