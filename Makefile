.PHONY: help build up down logs test clean dev-backend dev-frontend

# 默认目标
help:
	@echo "CertEase 构建工具"
	@echo ""
	@echo "可用命令:"
	@echo "  make build         - 构建所有 Docker 镜像"
	@echo "  make up            - 启动所有服务"
	@echo "  make down          - 停止所有服务"
	@echo "  make logs          - 查看服务日志"
	@echo "  make test          - 运行 API 测试"
	@echo "  make clean         - 清理所有容器和数据"
	@echo "  make dev-backend   - 启动后端开发服务器"
	@echo "  make dev-frontend  - 启动前端开发服务器"
	@echo "  make install       - 安装所有依赖"
	@echo "  make migrate       - 运行数据库迁移"

# 构建所有镜像
build:
	docker-compose build

# 启动服务
up:
	docker-compose up -d
	@echo "服务已启动:"
	@echo "  前端: http://localhost:3000"
	@echo "  后端: http://localhost:3001"

# 停止服务
down:
	docker-compose down

# 查看日志
logs:
	docker-compose logs -f

# 运行测试
test:
	@chmod +x test-api.sh
	@./test-api.sh

# 清理所有数据
clean:
	docker-compose down -v
	docker system prune -f

# 开发模式 - 后端
dev-backend:
	cd backend && npm run dev

# 开发模式 - 前端
dev-frontend:
	cd frontend && npm run dev

# 安装依赖
install:
	cd backend && npm install
	cd frontend && npm install

# 数据库迁移
migrate:
	cd backend && npx prisma migrate dev

# 生成 Prisma 客户端
generate:
	cd backend && npx prisma generate
