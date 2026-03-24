# SSL Manager - SSL 证书自动管理平台

基于 ACME 协议的 SSL 证书自动申请、续期和管理平台。支持 Let's Encrypt，提供友好的 Web 界面和完整的 API。

## 功能特性

- 🎫 **自动证书管理**：支持 Let's Encrypt 证书的自动申请和续期
- 🌐 **多 DNS 服务商支持**：支持 Cloudflare（阿里云、腾讯云适配器可扩展）
- 📊 **可视化 Dashboard**：实时监控证书状态和到期情况
- 🔄 **自动续期**：支持自动巡检和续期，无需人工干预
- 🔔 **Webhook 通知**：证书续期成功/失败时推送通知
- 🔐 **安全可靠**：敏感数据 AES-256-GCM 加密存储
- 🐳 **容器化部署**：Docker Compose 一键启动

## 快速开始

### 环境要求

- Docker 20.10+
- Docker Compose 2.0+

### 启动服务

1. 克隆仓库并进入目录

```bash
cd ssl-manager
```

2. 修改环境变量（可选）

```bash
# 编辑 .env 文件，修改 JWT_SECRET 和 ENCRYPTION_KEY
vim .env
```

3. 启动所有服务

```bash
docker-compose up -d
```

4. 访问 Web 界面

- 前端: http://localhost:3000
- 后端 API: http://localhost:3001

### 开发环境

#### 后端开发

```bash
cd backend
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 配置数据库和 Redis 连接

# 初始化数据库
npx prisma migrate dev
npx prisma generate

# 启动开发服务器
npm run dev
```

#### 前端开发

```bash
cd frontend
npm install

# 配置环境变量
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

#### Worker 开发

```bash
cd backend
npm run build
node dist/worker.js
```

## 使用指南

### 1. 注册账户

访问 http://localhost:3000/register 注册新账户

### 2. 添加 DNS 凭据

1. 进入 "DNS 凭据" 页面
2. 点击 "添加凭据"
3. 选择服务商（目前支持 Cloudflare）
4. 填写 API Token 并验证

#### Cloudflare API Token 获取

1. 登录 Cloudflare Dashboard
2. 进入 "My Profile" → "API Tokens"
3. 点击 "Create Token"
4. 选择 "Edit zone DNS" 模板
5. 权限设置为：Zone - DNS - Edit
6. 区域资源设置为：Include - All zones
7. 创建 Token 并复制

### 3. 添加域名并签发证书

1. 进入 "证书管理" 页面
2. 点击 "添加域名"
3. 选择 DNS 凭据
4. 输入域名（系统会自动验证域名归属）
5. 点击 "保存并签发"

### 4. 查看和管理证书

- 在证书详情页查看证书内容
- 支持下载 PEM 格式证书和私钥
- 可手动触发续期或删除证书

## 系统架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  PostgreSQL │
│  (Next.js)  │     │  (Express)  │     │  (数据存储)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   (队列)     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Worker    │
                    │ (续期执行)   │
                    └─────────────┘
```

## 主要技术栈

### 后端
- **框架**: Express.js + TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **队列**: BullMQ + Redis
- **ACME 客户端**: acme-client
- **DNS 验证**: Cloudflare API

### 前端
- **框架**: Next.js 15 + React 19 + TypeScript
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **HTTP 客户端**: Axios

## API 文档

### 认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户

### DNS 凭据
- `GET /api/dns-credentials` - 列表
- `POST /api/dns-credentials` - 创建
- `PUT /api/dns-credentials/:id` - 更新
- `DELETE /api/dns-credentials/:id` - 删除
- `POST /api/dns-credentials/:id/verify` - 验证连通性

### 证书
- `GET /api/certificates` - 列表
- `POST /api/certificates` - 创建
- `GET /api/certificates/:id` - 详情
- `PUT /api/certificates/:id` - 更新
- `DELETE /api/certificates/:id` - 删除
- `POST /api/certificates/renew` - 批量续期

## 生产部署注意事项

1. **修改环境变量**
   - 使用强随机字符串设置 `JWT_SECRET` 和 `ENCRYPTION_KEY`
   - 配置生产环境数据库和 Redis

2. **HTTPS 配置**
   - 建议在生产环境使用反向代理（Nginx/Traefik）配置 HTTPS
   - 或使用 Cloudflare Tunnel 等服务

3. **备份策略**
   - 定期备份 PostgreSQL 数据库
   - 备份加密密钥（丢失将导致无法解密 DNS 凭据和私钥）

4. **监控告警**
   - 配置健康检查端点：`/health`
   - 监控证书到期情况

## 开发路线图

- [x] 基础架构搭建
- [x] 用户认证系统
- [x] DNS 凭据管理（Cloudflare）
- [x] ACME 证书申请和续期
- [x] Web 管理界面
- [x] Docker 容器化
- [ ] 阿里云/腾讯云 DNS 适配器
- [ ] Webhook 通知系统
- [ ] 站内通知和邮件告警
- [ ] API Key 管理
- [ ] 证书吊销功能
- [ ] 多用户协作支持

## 许可证

MIT License
