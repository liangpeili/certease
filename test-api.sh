#!/bin/bash

# SSL Manager API 测试脚本
# 使用: ./test-api.sh

BASE_URL="http://localhost:3001"

echo "========================================="
echo "SSL Manager API 测试"
echo "========================================="

# 1. 健康检查
echo -e "\n1. 健康检查"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/health")
echo "Response: $RESPONSE"
echo "Status: $(echo $RESPONSE | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"

# 2. 检查邮箱是否已注册
echo -e "\n2. 检查邮箱 (test@example.com)"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/auth/check-email?email=test@example.com")
echo "Response: $RESPONSE"
echo "Exists: $(echo $RESPONSE | grep -o '"exists":[^,}]*' | cut -d':' -f2)"

# 3. 注册用户
echo -e "\n3. 注册用户"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234",
    "name": "Test User"
  }')
echo "Response: $RESPONSE"
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
USER_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Token: ${TOKEN:0:30}..."
echo "User ID: $USER_ID"

# 如果注册失败（用户已存在），尝试登录
if [ -z "$TOKEN" ]; then
  echo -e "\n3b. 用户已存在，尝试登录"
  echo "----------------------------------------"
  RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "Test1234"
    }')
  echo "Response: $RESPONSE"
  TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "Token: ${TOKEN:0:30}..."
fi

if [ -z "$TOKEN" ]; then
  echo "无法获取 Token，退出测试"
  exit 1
fi

# 4. 获取当前用户信息
echo -e "\n4. 获取当前用户信息"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $RESPONSE"

# 5. 添加 DNS 凭据
echo -e "\n5. 添加 DNS 凭据"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/dns-credentials" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Cloudflare",
    "provider": "cloudflare",
    "credentials": {
      "api_token": "test_token_12345"
    }
  }')
echo "Response: $RESPONSE"
CRED_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Credential ID: $CRED_ID"

# 6. 获取 DNS 凭据列表
echo -e "\n6. DNS 凭据列表"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/dns-credentials" \
  -H "Authorization: Bearer $TOKEN")
echo "Response (截断): $(echo $RESPONSE | cut -c1-200)..."

# 7. 验证 DNS 凭据
echo -e "\n7. 验证 DNS 凭据"
echo "----------------------------------------"
if [ -n "$CRED_ID" ]; then
  RESPONSE=$(curl -s -X POST "${BASE_URL}/api/dns-credentials/${CRED_ID}/verify" \
    -H "Authorization: Bearer $TOKEN")
  echo "Response: $RESPONSE"
else
  echo "跳过（没有凭据ID）"
fi

# 8. 添加证书
echo -e "\n8. 添加证书"
echo "----------------------------------------"
if [ -n "$CRED_ID" ]; then
  RESPONSE=$(curl -s -X POST "${BASE_URL}/api/certificates" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"domain\": \"example.com\",
      \"dns_credential_id\": \"${CRED_ID}\",
      \"is_wildcard\": false,
      \"issue_now\": false
    }")
  echo "Response: $RESPONSE"
  CERT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Certificate ID: $CERT_ID"
else
  echo "跳过（没有凭据ID）"
fi

# 9. 获取证书列表
echo -e "\n9. 证书列表"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/certificates" \
  -H "Authorization: Bearer $TOKEN")
echo "Response (截断): $(echo $RESPONSE | cut -c1-300)..."

# 10. 获取证书概览
echo -e "\n10. 证书概览"
echo "----------------------------------------"
RESPONSE=$(curl -s "${BASE_URL}/api/certificates/summary" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $RESPONSE"

echo -e "\n========================================="
echo "测试完成！"
echo "========================================="
