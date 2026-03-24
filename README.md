# CertEase

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/Express.js-4.x-blue?style=flat-square&logo=express" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql" />
  <img src="https://img.shields.io/badge/Redis-7-red?style=flat-square&logo=redis" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

<p align="center">
  <b>Automated SSL Certificate Management Platform</b><br>
  Auto-renewal, multi-DNS provider support, Webhook notifications
</p>

[English](./README.md) | [中文](./README.zh.md)

---

## Features

- 🎫 **Automated Certificate Management**: ACME protocol support (Let's Encrypt), automatic issuance and renewal
- 🌐 **Multi-DNS Provider Support**: Cloudflare (Aliyun, Tencent Cloud adapters extensible)
- 📊 **Visual Dashboard**: Real-time monitoring of certificate status and expiration
- 🔄 **Auto-Renewal**: Daily inspection and automatic renewal, no manual intervention needed
- 🔔 **Webhook Notifications**: Push notifications on certificate renewal success/failure
- 🔐 **Secure & Reliable**: AES-256-GCM encryption for sensitive data
- 🐳 **Containerized Deployment**: One-click startup with Docker Compose

## Quick Start

### Requirements

- Docker 20.10+
- Docker Compose 2.0+

### Start Services

```bash
# Clone repository
git clone https://github.com/liangpeili/certease.git
cd certease

# Start all services
docker-compose up -d
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### Development Mode

#### Backend

```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with database and Redis connection

# Initialize database
npx prisma migrate dev
npx prisma generate

# Start dev server
npm run dev
```

#### Frontend

```bash
cd frontend
npm install

# Configure environment
cp .env.example .env.local

# Start dev server
npm run dev
```

#### Worker

```bash
cd backend
npm run build
node dist/worker.js
```

## User Guide

### 1. Register Account

Visit http://localhost:3000/register to create a new account

### 2. Add DNS Credentials

1. Go to "DNS Credentials" page
2. Click "Add Credential"
3. Select provider (Cloudflare supported)
4. Enter API Token and verify

#### Get Cloudflare API Token

1. Login to Cloudflare Dashboard
2. Go to "My Profile" → "API Tokens"
3. Click "Create Token"
4. Select "Edit zone DNS" template
5. Set permissions: Zone - DNS - Edit
6. Set zone resources: Include - All zones
7. Create token and copy

### 3. Add Domain & Issue Certificate

1. Go to "Certificates" page
2. Click "Add Domain"
3. Select DNS credential
4. Enter domain (ownership will be verified automatically)
5. Click "Save & Issue"

### 4. View & Manage Certificates

- View certificate details and content
- Download PEM format certificates and keys
- Manual renewal or deletion

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  PostgreSQL │
│  (Next.js)  │     │  (Express)  │     │  (Storage)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   (Queue)   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Worker    │
                    │ (Renewal)   │
                    └─────────────┘
```

## Tech Stack

### Backend
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: BullMQ + Redis
- **ACME Client**: acme-client
- **DNS**: Cloudflare API

### Frontend
- **Framework**: Next.js 15 + React 19 + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **HTTP Client**: Axios
- **i18n**: next-intl

## API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | User registration |
| POST | /api/auth/login | User login |
| GET | /api/auth/me | Get current user |

### DNS Credentials
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dns-credentials | List credentials |
| POST | /api/dns-credentials | Create credential |
| POST | /api/dns-credentials/:id/verify | Verify connectivity |

### Certificates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/certificates | List certificates |
| POST | /api/certificates | Create certificate |
| POST | /api/certificates/renew | Batch renewal |
| GET | /api/certificates/summary | Dashboard stats |

## Production Deployment Notes

1. **Change Environment Variables**
   - Use strong random strings for `JWT_SECRET` and `ENCRYPTION_KEY`
   - Configure production database and Redis

2. **HTTPS Configuration**
   - Use reverse proxy (Nginx/Traefik) for HTTPS
   - Or use Cloudflare Tunnel

3. **Backup Strategy**
   - Regular PostgreSQL backups
   - Backup encryption keys (loss will prevent decryption)

4. **Monitoring**
   - Health check endpoint: `/health`
   - Monitor certificate expiration

## Development Roadmap

- [x] Basic architecture
- [x] User authentication
- [x] DNS credential management (Cloudflare)
- [x] ACME certificate issuance and renewal
- [x] Web dashboard
- [x] Docker containerization
- [x] i18n internationalization
- [ ] Aliyun/Tencent Cloud DNS adapters
- [ ] Webhook notification system
- [ ] Email notifications
- [ ] API key management
- [ ] Certificate revocation
- [ ] Multi-user collaboration

## License

MIT License

---

<p align="center">
  Made with ❤️ for easier SSL certificate management
</p>
