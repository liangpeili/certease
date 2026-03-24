import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './utils';

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    const response = error.response?.data as any;
    
    // 处理 401 未授权
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    
    // 返回格式化的错误
    return Promise.reject({
      message: response?.error?.message || error.message || '请求失败',
      code: response?.error?.code || 'UNKNOWN_ERROR',
      details: response?.error?.details,
      status: error.response?.status,
    });
  }
);

// API 方法封装
export const authApi = {
  login: (data: { email: string; password: string }) => 
    api.post('/api/auth/login', data),
  
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/api/auth/register', data),
  
  checkEmail: (email: string) =>
    api.get('/api/auth/check-email', { params: { email } }),
  
  getMe: () =>
    api.get('/api/auth/me'),
};

export const dnsCredentialApi = {
  list: (params?: { page?: number; size?: number }) =>
    api.get('/api/dns-credentials', { params }),
  
  create: (data: { name: string; provider: string; credentials: Record<string, string> }) =>
    api.post('/api/dns-credentials', data),
  
  update: (id: string, data: { name?: string; credentials?: Record<string, string> }) =>
    api.put(`/api/dns-credentials/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/api/dns-credentials/${id}`),
  
  verify: (id: string) =>
    api.post(`/api/dns-credentials/${id}/verify`),
  
  getZones: (id: string) =>
    api.get(`/api/dns-credentials/${id}/zones`),
};

export const certificateApi = {
  getSummary: () =>
    api.get('/api/certificates/summary'),
  
  list: (params?: {
    page?: number;
    size?: number;
    status?: string;
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  }) => api.get('/api/certificates', { params }),
  
  get: (id: string) =>
    api.get(`/api/certificates/${id}`),
  
  create: (data: {
    domain: string;
    dns_credential_id: string;
    is_wildcard?: boolean;
    auto_renew?: boolean;
    renew_before_days?: number;
    issue_now?: boolean;
    webhook_ids?: string[];
  }) => api.post('/api/certificates', data),
  
  update: (id: string, data: {
    auto_renew?: boolean;
    renew_before_days?: number;
    webhook_ids?: string[];
  }) => api.put(`/api/certificates/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/api/certificates/${id}`),
  
  getStatus: (id: string) =>
    api.get(`/api/certificates/${id}/status`),
  
  checkDomain: (data: { domain: string; dns_credential_id: string }) =>
    api.post('/api/certificates/check-domain', data),
  
  batchRenew: (certIds: string[]) =>
    api.post('/api/certificates/renew', { cert_ids: certIds }),
  
  revoke: (id: string, reason: string) =>
    api.post(`/api/certificates/${id}/revoke`, { reason }),
  
  getLogs: (id: string, params?: { page?: number; size?: number }) =>
    api.get(`/api/certificates/${id}/logs`, { params }),
};

export default api;
