FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# 复制源代码
COPY . .

# 生成 Prisma 客户端并构建
RUN npx prisma generate
RUN npm run build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

# 安装 openssl（Prisma 需要）
RUN apk add --no-cache openssl

# 复制生产依赖和构建产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
