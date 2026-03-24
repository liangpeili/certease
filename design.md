# SSL 证书自动管理平台 — 完整系统设计与任务需求

> 本文档基于原始 PRD 进行了完整的设计补全。原文档聚焦在续期引擎的后端架构上，但一个可落地的系统还需要回答以下问题：用户从零开始怎么用起来？第一张证书怎么签发？证书签下来之后怎么交付到生产环境？出了问题用户怎么自救？多个用户怎么协作？这些问题在原文档中没有展开，本文档逐一补齐。

---

## 第一部分：原始设计盲区分析

在进入详细设计之前，先列出原始 PRD 中"点到为止"或完全缺失的关键环节，这些是本文档要重点补全的内容：

| 缺失项 | 影响 |
|--------|------|
| **首次签发流程** | 原文只讲续期，但用户第一次使用系统时，证书从无到有的完整路径没有设计 |
| **域名归属验证** | 用户添加 `google.com` 怎么办？没有任何机制防止用户为不属于自己的域名申请证书 |
| **新手引导 (Onboarding)** | 用户注册后看到空白页面，不知道该做什么。需要一条清晰的引导路径 |
| **证书交付机制** | 证书签发/续期成功后，用户怎么拿到它？只提了 Webhook，但没有设计下载、API 拉取、自动部署等完整交付链路 |
| **证书吊销 (Revoke)** | 私钥泄露时需要紧急吊销，原文完全未提及 |
| **多用户与权限** | users 表存在但没有权限模型，谁能看谁的证书？能不能有只读成员？ |
| **ACME 账户生命周期** | Let's Encrypt 账户密钥怎么创建、存储、恢复？用户共用还是独立？ |
| **操作审计日志** | renewal_logs 只记录续期，但谁在什么时候删了一个凭据、改了 Webhook 配置，这些关键操作没有审计 |
| **邮件/站内通知** | Webhook 是给机器的，给人的通知（证书即将过期、续期失败）没有设计 |
| **泛域名与多域名处理** | 提到了泛域名但没有设计：`*.example.com` 和 `example.com` 是一张证书还是两张？SAN 列表怎么管理？ |
| **环境切换安全** | 从 Staging 切到 Production 只提了一句，但实际涉及 ACME 账户切换、证书重签、前端提示等一系列操作 |

---

## 第二部分：用户旅程与交互设计

### 旅程一：新用户从注册到拿到第一张证书

这是整个系统最关键的路径。如果用户在这个过程中卡住，后面所有功能都没有意义。

#### 步骤 1：注册与登录

**页面**: `/register`, `/login`

**交互细节**:
- 注册表单：邮箱 + 密码 + 确认密码。邮箱需要格式校验和唯一性校验（失焦时异步检查，不等到提交）。
- 密码强度：至少 8 位，必须包含字母和数字。输入时实时显示强度指示条（弱/中/强）。
- 注册成功后不需要邮箱验证（MVP 阶段，降低门槛），直接登录并跳转到引导页。
- 登录表单：邮箱 + 密码。登录失败显示 "邮箱或密码错误"（不区分具体是哪个错，防止枚举）。连续失败 5 次后锁定 15 分钟。

**状态变化**: 无 → 已登录，Session 创建，JWT 写入 HttpOnly Cookie。

#### 步骤 2：新手引导 (Onboarding Wizard)

**页面**: `/onboarding`（仅在用户没有任何 DNS 凭据时显示，已有凭据的用户跳过）

**交互细节**:
这是一个分步向导（Stepper），共 3 步，顶部有步骤条显示进度。

**第 1 步 — 选择 DNS 服务商**:
- 展示支持的 DNS 服务商卡片（Cloudflare / 阿里云 / 腾讯云），每个卡片带 Logo 和一句话描述。
- 用户点击选中一个，卡片高亮，底部出现 "下一步" 按钮。
- 如果用户不确定自己用的是什么，提供一个 "不知道？查看帮助" 链接，打开一个侧边帮助面板，解释如何判断自己的 DNS 托管在哪里。

**第 2 步 — 填写 API 凭据**:
- 根据第 1 步选择的服务商，动态渲染对应的表单字段：
  - Cloudflare: API Token（推荐）或 Global API Key + Email
  - 阿里云: AccessKey ID + AccessKey Secret
  - 腾讯云: SecretId + SecretKey
- 每个字段旁边有一个 "?" 图标，Hover 弹出 Popover 说明在哪里获取这个值（带截图或外链到服务商文档）。
- 凭据名称字段：用户给这组凭据起个名字（如 "我的 Cloudflare 账号"），方便后续识别。
- 填写完成后点击 "验证并保存"：
  - 按钮变为 Loading 状态 + 文案 "正在验证连通性..."
  - 后端调用对应服务商 API 做轻量验证（列出域名列表）
  - **成功**: 绿色 ✓ 提示 "验证通过，发现 N 个域名"，自动进入第 3 步
  - **失败**: 红色 ✗ 提示具体原因（如 "API Token 权限不足，需要 Zone.DNS 编辑权限"），停留在当前步骤，用户修改后可重试

**第 3 步 — 添加第一个域名并签发证书**:
- 域名输入框：用户输入要管理的域名（如 `example.com`）。
- 输入时做格式校验（正则匹配合法域名格式）。
- 泛域名开关：一个 Toggle，打开后自动在域名前加 `*.`，且提示 "泛域名证书将覆盖所有子域名"。
- 域名归属预检：用户输入域名后，失焦时后端检查该域名是否在用户的 DNS 凭据管理的 Zone 列表中。
  - **在列表中**: 绿色 ✓ "域名已确认归属"
  - **不在列表中**: 红色提示 "该域名不在您的 DNS 账号中，请确认域名拼写或 DNS 托管设置"，禁止继续。这一步同时解决了防止用户为非己有域名申请证书的安全问题。
- 点击 "签发证书"：
  - 弹出确认对话框："即将为 `example.com` 签发 SSL 证书，过程需要 1-3 分钟，期间请勿关闭页面。确认继续？"
  - 确认后进入等待状态：页面显示一个步骤进度条，实时反映当前进展（后端通过 SSE 或轮询推送进度）：
    1. `正在创建证书订单...` ✓
    2. `正在配置 DNS 验证记录...` ✓
    3. `等待 DNS 记录生效...`（这一步可能最长，显示已等待时间）
    4. `正在提交验证...` ✓
    5. `正在下载证书...` ✓
    6. `清理 DNS 记录...` ✓
  - **签发成功**: 展示成功页面，包含：
    - 🎉 "证书签发成功！"
    - 证书摘要：域名、有效期、到期时间
    - 两个主要操作按钮："下载证书" + "前往管理面板"
    - 一个次要操作："配置自动部署（Webhook）"
  - **签发失败**: 展示失败页面，包含：
    - 具体失败步骤和错误信息
    - 排查建议（如 "DNS 记录未生效，请检查域名 NS 记录是否指向正确的 DNS 服务商"）
    - "重试" 按钮

**状态变化**: 证书记录从 `无` → `processing` → `active`（或 `failed`）

#### 为什么这样设计

引导流程把"添加凭据 → 验证归属 → 签发证书"串成一条直线，用户不需要在多个页面之间跳转。域名归属预检在这里自然发生，不需要额外的验证流程。首次签发的步骤进度条让用户在等待的 1-3 分钟内知道系统在干什么，不会以为页面卡死了。

---

### 旅程二：日常管理 — 查看状态、手动续期、处理异常

用户登录后的主要使用场景。

#### Dashboard 首页 (`/dashboard`)

**布局**（从上到下）:

**区域 1 — 顶部统计卡片组（4 张）**:
| 卡片 | 数据 | 颜色 | 操作 |
|------|------|------|------|
| 证书总数 | 活跃证书总数 | 蓝色 | 点击跳转证书列表 |
| 即将到期 | ≤30 天到期的数量 | 黄色 | 附带 "一键续期" 按钮 |
| 续期失败 | 状态为 failed 的数量 | 红色 | 附带 "一键重试" 按钮 |
| 已过期 | 状态为 expired 的数量 | 灰色 | 点击跳转列表（筛选已过期） |

**"一键续期" 和 "一键重试" 的交互**:
- 点击后按钮立即变为 Disabled + 旋转图标 + 文案 "正在提交..."
- 后端接口返回 200 后，按钮文案变为 "已提交 N 个任务"，3 秒后恢复可点击状态
- 页面右上角弹出 Toast："N 个证书已加入续期队列，预计 1-5 分钟完成"
- 卡片上的数字不立即变化（因为任务还在队列中），而是靠页面内的轮询自动更新

**区域 2 — 即将到期列表（紧急看板）**:
- 展示未来 7 天内到期的证书，按到期时间升序排列
- 每行显示：域名、剩余天数（红色加粗）、状态徽章、"续期" 按钮
- 如果列表为空，显示一个 ✅ "所有证书状态健康" 的占位提示

**区域 3 — 最近活动时间线**:
- 最近 20 条操作记录，按时间倒序
- 每条记录：时间、事件类型图标、描述文案（如 "example.com 证书续期成功" / "api.example.com 续期失败：DNS TXT 记录未检测到"）
- 失败记录用红色左边框标记，点击可展开查看完整错误信息

**数据刷新机制**:
- 页面首次加载时拉取全部数据
- 如果页面上存在任何 `pending_renewal` 或 `processing` 状态的证书，启动一个全局轮询定时器，每 5 秒调用 `/api/certificates/summary` 更新卡片数字和列表
- 当所有证书都不在处理中状态时，停止轮询，切换为 60 秒一次的低频刷新（检查是否有新的到期预警）
- 用户切到其他浏览器 Tab 时暂停轮询（`visibilitychange` 事件），切回来时立即拉取一次

---

#### 证书管理列表页 (`/certificates`)

**页面结构**:

**顶部操作栏**:
- 左侧：搜索框（按域名搜索，支持模糊匹配）+ 状态下拉筛选器（全部 / 健康 / 临期 / 失败 / 已过期）
- 右侧：**"添加域名"** 按钮（主要操作，Primary 样式）+ **"批量续期"** 按钮（仅在 Checkbox 选中 ≥1 时可用，否则 Disabled）

**数据表格**:

| 列 | 内容 | 交互 |
|----|------|------|
| ☐ | Checkbox，用于批量操作 | 表头 Checkbox 全选/取消全选 |
| 域名 | 显示完整域名，泛域名带 `*.` 前缀标识 | 点击进入详情 |
| 类型 | 单域名 / 泛域名 | - |
| DNS 服务商 | 关联的凭据名称 + 服务商图标 | - |
| 签发时间 | YYYY-MM-DD HH:mm | - |
| 到期时间 | YYYY-MM-DD HH:mm | - |
| 剩余天数 | 数字 + 颜色（>30 绿, 7-30 黄, <7 红, 0 灰） | - |
| 状态 | 状态徽章（见下方状态视觉规范） | - |
| 操作 | 按钮组（见下方操作列设计） | - |

**状态列视觉规范**:

```
active         → 🟢 绿色实心圆 + "生效中"
pending_renewal → 🟡 黄色圆 + 脉冲动画 + "排队中"
processing     → 🔵 蓝色圆 + 旋转动画 + "申请中"  
                  Hover 显示 Tooltip: "Worker 正在处理，预计 1-3 分钟"
failed         → 🔴 红色圆 + "失败"
                  旁边带 ⓘ 图标，Hover 显示失败原因摘要
                  如 "DNS TXT 记录未检测到" 或 "Let's Encrypt 速率限制"
expired        → ⚫ 灰色圆 + "已过期"
```

**操作列设计**（每行右侧 "更多" 下拉菜单 + 一个主要操作按钮）:

| 当前状态 | 主要按钮 | 下拉菜单项 |
|---------|---------|-----------|
| active | "续期"（可点击） | 下载证书 / 查看详情 / 吊销证书 / 删除 |
| pending_renewal | "续期"（禁用，灰色） | 查看详情 / 取消排队 |
| processing | "续期"（禁用，灰色） | 查看详情 |
| failed | **"重试"**（Primary 红色高亮） | 查看日志 / 查看详情 / 删除 |
| expired | "重新签发" | 查看详情 / 删除 |

**批量续期交互细节**:
1. 用户勾选多个 Checkbox
2. 顶部 "批量续期" 按钮变为可用，显示已选数量："续期选中的 N 个"
3. 点击后弹出确认对话框，列出将要续期的域名清单，自动排除掉 `processing` 和 `pending_renewal` 状态的，并标注哪些被排除了及原因
4. 确认后调用批量续期接口，每个证书的表格行立即切换状态动画
5. 轮询逻辑与 Dashboard 相同

**空状态**:
- 用户没有任何证书时，表格区域显示大面积引导："您还没有添加任何域名。" + "添加第一个域名" 按钮，点击触发添加域名流程。

---

#### 添加新域名流程 (`/certificates` 页内弹窗)

**触发**: 点击 "添加域名" 按钮，打开右侧滑出抽屉 (Drawer)

**抽屉内容**:

**第 1 区 — 域名配置**:
- DNS 凭据选择：下拉框，列出用户已添加的所有凭据。如果没有凭据，显示 "请先添加 DNS 凭据" + 跳转链接。
- 域名输入方式：
  - 单域名模式（默认）：一个输入框 + 泛域名 Toggle
  - 批量模式（Switch 切换）：TextArea，每行一个域名，支持一次添加多个。泛域名在域名前加 `*.`
- 域名归属预检（同引导流程第 3 步）：输入后异步校验域名是否在选定凭据的 Zone 中。

**第 2 区 — 高级选项**（默认折叠，点击展开）:
- 证书类型：单域名 / 泛域名 + 根域名（即 SAN 证书，同时包含 `*.example.com` 和 `example.com`）
- 自动续期：Toggle（默认开启），关闭后该域名不参与每日巡检
- 自动续期提前天数：输入框，默认 30，范围 7-60
- 关联 Webhook：多选下拉，从已配置的 Webhook 中选择，续期成功/失败时触发通知

**第 3 区 — 操作按钮**:
- "保存并签发"（Primary）：保存域名记录 + 立即触发首次签发，走异步队列
- "仅保存"（Secondary）：只保存记录，不立即签发，状态为 `pending_initial`（等待首次签发）
- "取消"

**点击"保存并签发"后的交互**:
- 抽屉关闭
- 表格中立即出现新的一行，状态为 `pending_renewal`
- Toast 提示 "域名已添加，证书正在签发中..."
- 正常走轮询更新流程

---

#### 证书详情页 (`/certificates/:id`)

**页面布局**（左右分栏或 Tab 切换）:

**信息面板**:
- 域名（大标题）
- 状态徽章（同列表视觉规范）
- 签发时间 / 到期时间 / 剩余天数
- SAN 列表（证书包含的所有域名）
- 签发机构：Let's Encrypt
- DNS 服务商：凭据名称
- 自动续期状态：开启/关闭 + 提前天数
- ACME 订单 URL（供高级用户调试）

**证书内容面板**:
- **Fullchain (公钥链)**：代码框展示，右上角 "复制" 按钮，点击后 Toast "已复制到剪贴板"
- **Private Key (私钥)**：默认隐藏，显示为 "••••••"，旁边有 "显示" 按钮。点击后弹出二次确认对话框："私钥是敏感信息，请确认您在安全的环境中操作。" 确认后显示内容 + 复制按钮。30 秒后自动重新隐藏。
- **下载按钮组**：
  - "下载 PEM 格式"（fullchain.pem + privkey.pem 打包为 zip）
  - "下载 PFX/PKCS12 格式"（需要用户输入一个导出密码）
  - "下载 Nginx 配置片段"（自动生成 `ssl_certificate` 和 `ssl_certificate_key` 指令的配置文件）

**续期日志面板**:
- 时间线形式，按时间倒序
- 每条记录包含：
  - 时间戳
  - 触发方式：`自动巡检` / `手动触发` / `一键续期`（区分来源方便排查）
  - 执行步骤明细（每个步骤的开始时间、结束时间、结果）
  - 最终状态：成功 / 失败
  - 失败时的完整错误信息（可展开折叠）
  - Worker 节点标识（如果有多个 Worker，方便排查）

**操作区**（页面顶部右侧）:
- "手动续期" / "重试" 按钮（根据状态变化，逻辑同列表页）
- "吊销证书" 按钮（危险操作，红色文字按钮，见旅程五）
- "删除" 按钮（危险操作）
- "编辑设置" 按钮（修改自动续期配置、关联 Webhook）

---

### 旅程三：证书交付 — 用户怎么把证书用起来

原始 PRD 只提到 Webhook，但实际场景中用户需要多种方式获取证书。

#### 方式 1：手动下载（最基础）

已在证书详情页设计，支持 PEM / PFX / Nginx 配置片段三种格式。

#### 方式 2：API 拉取（适合自动化脚本）

用户在 "设置 → API 密钥" 页面生成 API Key，然后通过 API 拉取证书：

```
GET /api/v1/certificates/:domain/download
Header: Authorization: Bearer <api_key>
Query: format=pem|pfx
```

这个接口始终返回该域名最新的有效证书，用户的部署脚本可以定期调用。

#### 方式 3：Webhook 推送（适合自动部署）

证书续期成功后，系统主动将新证书推送到用户配置的 URL。

Webhook 配置页面设计见模块七。Payload 结构：

```json
{
  "event": "certificate.renewed",
  "timestamp": "2025-01-15T02:30:00Z",
  "certificate": {
    "domain": "example.com",
    "sans": ["example.com", "*.example.com"],
    "not_before": "2025-01-15T00:00:00Z",
    "not_after": "2025-04-15T00:00:00Z",
    "fullchain_pem": "-----BEGIN CERTIFICATE-----\n...",
    "private_key_pem": "-----BEGIN PRIVATE KEY-----\n..."
  }
}
```

注意：Webhook Payload 中包含私钥，因此 HMAC 签名验证是强制的，且建议用户的接收端使用 HTTPS。

#### 方式 4：部署目标管理（高级功能，可作为 V2）

用户配置 "部署目标"，系统在证书续期后自动将证书推送到目标服务器：
- SSH 推送：配置服务器 IP、端口、用户名、SSH 密钥、证书存放路径、Reload 命令（如 `nginx -s reload`）
- 云 CDN 推送：配置阿里云 CDN / 腾讯云 CDN 的 API 凭据，自动更新 CDN 证书
- 此功能复杂度较高，建议 MVP 不做，作为 V2 规划

---

### 旅程四：异常处理 — 续期失败后用户怎么自救

这是原始 PRD 中最薄弱的环节。用户看到红色 "失败" 之后，如果不知道为什么失败、怎么修，就只能来找你。

#### 失败原因分类与引导

系统需要将 Worker 的技术错误翻译成用户能理解的语言，并给出操作建议：

| Worker 错误 | 用户看到的失败原因 | 操作建议 |
|------------|-----------------|---------|
| DNS TXT record not found after timeout | DNS 验证记录未生效 | 请检查域名的 NS 记录是否指向正确的 DNS 服务商。如果最近切换过 DNS，可能需要等待 24-48 小时全球生效后重试。 |
| DNS API authentication failed | DNS 服务商认证失败 | 您的 DNS API 凭据可能已过期或被撤销，请前往 [凭据管理] 更新。 |
| DNS API permission denied | DNS 服务商权限不足 | 您的 API 凭据缺少 DNS 编辑权限，请在服务商后台检查权限配置。 |
| ACME rate limit exceeded | Let's Encrypt 频率限制 | 该域名近期申请次数过多，已被 Let's Encrypt 临时限制。系统将在 N 小时后自动重试，请勿手动操作。 |
| ACME authorization invalid | 域名验证失败 | Let's Encrypt 无法验证您对该域名的所有权。请确认域名 DNS 托管设置正确。 |
| Network timeout to ACME server | Let's Encrypt 服务器通信超时 | Let's Encrypt 服务可能暂时不可用，系统将自动重试。 |
| Zone not found for domain | 未找到域名对应的 DNS Zone | 该域名不在您的 DNS 账号管理范围内。请检查域名拼写或 DNS 凭据是否正确。 |

#### 失败状态的 UI 交互

在证书列表页：
- failed 状态的行背景色轻微变红（`bg-red-50`），视觉上与其他行区分
- 状态列的 ⓘ 图标 Hover 显示失败原因摘要 + "查看详情" 链接
- 操作列的 "重试" 按钮为红色高亮，吸引注意力

在证书详情页：
- 顶部显示红色 Alert 横幅："证书续期失败 — [失败原因摘要]"
- 横幅内包含 "操作建议" 折叠区 + "重试续期" 按钮
- 续期日志面板中，失败的步骤标红，展开可看完整错误堆栈

#### 自动重试策略（对用户透明）

| 失败次数 | 下次自动重试间隔 | 用户可见行为 |
|---------|---------------|------------|
| 第 1 次 | 6 小时后 | 状态保持 failed，日志记录 "将在 6 小时后自动重试" |
| 第 2 次 | 24 小时后 | 同上 |
| 第 3 次 | 不再自动重试 | 状态保持 failed，发送邮件通知用户 "需要人工介入" |

用户手动点击 "重试" 会重置失败计数器。

---

### 旅程五：证书吊销 (Revoke)

**触发场景**: 私钥泄露、域名转让、不再使用。

**交互设计**:
1. 在证书详情页点击 "吊销证书"
2. 弹出危险操作确认对话框（红色边框）：
   - 标题："吊销证书"
   - 说明："吊销后，该证书将立即失效，所有使用该证书的服务器将无法建立 HTTPS 连接。此操作不可逆。"
   - 需要用户手动输入域名确认（防误操作）
   - 吊销原因选择（下拉）：密钥泄露 / 不再使用 / 域名转让 / 其他
3. 确认后：
   - 后端调用 ACME 吊销接口
   - 状态变为 `revoked`（新增状态）
   - 触发关联的 Webhook，事件类型 `certificate.revoked`
   - 该域名的自动续期暂停（需要用户手动重新签发）

---

## 第三部分：完整数据模型设计

### 表结构

#### `users` — 用户

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100),
  role          VARCHAR(20) NOT NULL DEFAULT 'owner',  -- owner | admin | viewer
  
  -- 登录安全
  failed_login_count    INT NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP,
  
  -- 通知偏好
  notify_email_enabled  BOOLEAN NOT NULL DEFAULT true,   -- 是否接收邮件通知
  notify_before_days    INT NOT NULL DEFAULT 7,          -- 到期前几天开始通知
  
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### `acme_accounts` — ACME 账户

```sql
-- 每个用户独立的 Let's Encrypt 账户，隔离速率限制影响
CREATE TABLE acme_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  
  email         VARCHAR(255) NOT NULL,         -- 注册到 LE 的邮箱（接收过期提醒）
  account_url   VARCHAR(500),                  -- LE 返回的账户 URL
  private_key   TEXT NOT NULL,                 -- 账户密钥对（JWK 格式，AES 加密存储）
  environment   VARCHAR(20) NOT NULL DEFAULT 'staging',  -- staging | production
  
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_acme_accounts_user ON acme_accounts(user_id);
```

#### `dns_credentials` — DNS 服务商凭据

```sql
CREATE TABLE dns_credentials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  
  name          VARCHAR(100) NOT NULL,          -- 用户自定义名称
  provider      VARCHAR(30) NOT NULL,           -- cloudflare | aliyun | tencentcloud
  
  -- 凭据字段（AES-256-GCM 加密存储）
  credentials   TEXT NOT NULL,                  -- JSON 格式加密后的凭据内容
  -- Cloudflare: {"api_token": "xxx"} 或 {"api_key": "xxx", "email": "xxx"}
  -- 阿里云:    {"access_key_id": "xxx", "access_key_secret": "xxx"}
  -- 腾讯云:    {"secret_id": "xxx", "secret_key": "xxx"}
  
  -- 验证状态
  verified      BOOLEAN NOT NULL DEFAULT false,
  verified_at   TIMESTAMP,
  zone_count    INT,                            -- 验证时发现的 Zone 数量
  
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dns_credentials_user ON dns_credentials(user_id);
```

#### `certificates` — 证书核心表

```sql
CREATE TABLE certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  dns_credential_id UUID NOT NULL REFERENCES dns_credentials(id),
  acme_account_id UUID REFERENCES acme_accounts(id),
  
  -- 域名信息
  domain          VARCHAR(255) NOT NULL,         -- 主域名
  san_domains     JSONB NOT NULL DEFAULT '[]',   -- SAN 列表, 如 ["example.com", "*.example.com"]
  is_wildcard     BOOLEAN NOT NULL DEFAULT false,
  
  -- 证书内容（签发成功后填入）
  fullchain_pem   TEXT,                          -- 完整证书链
  private_key_pem TEXT,                          -- 私钥（AES 加密存储）
  certificate_pem TEXT,                          -- 仅终端实体证书（用于解析元数据）
  
  -- 证书元数据
  issued_at       TIMESTAMP,
  expires_at      TIMESTAMP,
  serial_number   VARCHAR(100),
  fingerprint_sha256 VARCHAR(100),
  
  -- 状态机
  status          VARCHAR(20) NOT NULL DEFAULT 'pending_initial',
  -- pending_initial:  刚添加，等待首次签发
  -- pending_renewal:  已进入续期队列
  -- processing:       Worker 正在处理
  -- active:           证书有效
  -- failed:           签发/续期失败
  -- expired:          已过期
  -- revoked:          已吊销
  
  -- 自动续期配置
  auto_renew       BOOLEAN NOT NULL DEFAULT true,
  renew_before_days INT NOT NULL DEFAULT 30,     -- 到期前多少天开始续期
  
  -- 失败追踪
  fail_count       INT NOT NULL DEFAULT 0,       -- 连续失败次数
  last_fail_reason TEXT,                         -- 最近一次失败原因（用户友好文案）
  last_fail_detail TEXT,                         -- 最近一次失败技术详情（完整错误栈）
  last_fail_at     TIMESTAMP,
  next_retry_at    TIMESTAMP,                    -- 下次自动重试时间
  
  -- ACME 订单追踪
  acme_order_url   VARCHAR(500),                 -- 当前 ACME 订单 URL
  
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_certificates_user ON certificates(user_id);
CREATE INDEX idx_certificates_status ON certificates(status);
CREATE INDEX idx_certificates_expires ON certificates(expires_at);
CREATE INDEX idx_certificates_domain ON certificates(domain);
-- 同一用户下域名唯一
CREATE UNIQUE INDEX idx_certificates_user_domain ON certificates(user_id, domain);
```

#### `renewal_logs` — 续期操作日志

```sql
CREATE TABLE renewal_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id  UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  
  -- 触发信息
  trigger_type    VARCHAR(20) NOT NULL,          -- auto_cron | manual_single | manual_batch | manual_onboarding
  triggered_by    UUID REFERENCES users(id),     -- 手动触发时记录操作人
  
  -- 执行过程
  started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMP,
  duration_ms     INT,                           -- 整体耗时
  
  -- 步骤明细（JSONB 数组，记录每个步骤）
  steps           JSONB NOT NULL DEFAULT '[]',
  -- 格式: [
  --   {"step": "create_order", "status": "success", "started_at": "...", "finished_at": "...", "message": "..."},
  --   {"step": "add_dns_record", "status": "success", ...},
  --   {"step": "verify_dns_propagation", "status": "success", "detail": "8.8.8.8: OK, 1.1.1.1: OK, waited 45s"},
  --   {"step": "submit_challenge", "status": "failed", "error": "...", "error_detail": "..."}
  -- ]
  
  -- 最终结果
  result          VARCHAR(20) NOT NULL DEFAULT 'running',  -- running | success | failed
  error_summary   TEXT,                          -- 失败时的用户友好摘要
  error_detail    TEXT,                          -- 失败时的完整技术错误
  
  -- Worker 标识
  worker_id       VARCHAR(50),                   -- Worker 节点标识符
  
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_renewal_logs_cert ON renewal_logs(certificate_id);
CREATE INDEX idx_renewal_logs_created ON renewal_logs(created_at);
```

#### `webhook_configs` — Webhook 配置

```sql
CREATE TABLE webhook_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  
  name            VARCHAR(100) NOT NULL,
  url             VARCHAR(500) NOT NULL,          -- 推送目标 URL
  secret          VARCHAR(255) NOT NULL,          -- HMAC 签名密钥
  
  -- 触发事件（可多选）
  events          JSONB NOT NULL DEFAULT '["renewal_success", "renewal_failed"]',
  -- 可选值: renewal_success | renewal_failed | cert_expiring | cert_revoked
  
  -- 关联的证书（空 = 全部证书）
  certificate_ids JSONB DEFAULT NULL,             -- null = 所有证书, ["id1","id2"] = 指定证书
  
  -- 状态
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMP,
  last_response_code INT,                         -- 最近一次推送的 HTTP 响应码
  consecutive_failures INT NOT NULL DEFAULT 0,    -- 连续推送失败次数
  -- 连续失败 10 次后自动 disable，防止无限重试到一个挂掉的地址
  
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_webhook_configs_user ON webhook_configs(user_id);
```

#### `webhook_logs` — Webhook 推送日志

```sql
CREATE TABLE webhook_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id UUID NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
  certificate_id    UUID REFERENCES certificates(id),
  
  event_type        VARCHAR(30) NOT NULL,
  payload           JSONB NOT NULL,                -- 推送的完整 Payload（脱敏，不含私钥）
  
  -- 推送结果
  attempt           INT NOT NULL DEFAULT 1,        -- 第几次尝试
  response_code     INT,
  response_body     TEXT,                          -- 截取前 1000 字符
  error             TEXT,                          -- 网络错误信息
  
  sent_at           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_webhook_logs_config ON webhook_logs(webhook_config_id);
```

#### `api_keys` — API 密钥（用于外部接口访问）

```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  
  name        VARCHAR(100) NOT NULL,              -- 用户命名，如 "部署脚本用"
  key_hash    VARCHAR(255) NOT NULL,              -- API Key 的 SHA-256 哈希
  key_prefix  VARCHAR(10) NOT NULL,               -- Key 的前 8 位，用于显示识别
  
  -- 权限范围
  scopes      JSONB NOT NULL DEFAULT '["certificates:read"]',
  -- certificates:read | certificates:write | certificates:download
  
  last_used_at TIMESTAMP,
  expires_at   TIMESTAMP,                         -- null = 永不过期
  
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

#### `audit_logs` — 操作审计日志

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  
  action      VARCHAR(50) NOT NULL,
  -- 枚举: user.login | user.logout
  --        dns_credential.create | dns_credential.update | dns_credential.delete
  --        certificate.create | certificate.delete | certificate.revoke
  --        certificate.manual_renew | certificate.batch_renew
  --        webhook.create | webhook.update | webhook.delete
  --        api_key.create | api_key.delete
  --        settings.update
  
  resource_type VARCHAR(30),                     -- certificate | dns_credential | webhook | api_key
  resource_id   UUID,
  
  detail        JSONB,                           -- 操作相关的额外信息
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

---

## 第四部分：完整 API 设计

### 认证相关

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/auth/register` | 注册 | `{email, password, name}` | `{user, token}` |
| POST | `/api/auth/login` | 登录 | `{email, password}` | `{user, token}` |
| POST | `/api/auth/logout` | 登出 | - | `204` |
| GET | `/api/auth/me` | 当前用户 | - | `{user}` |
| POST | `/api/auth/refresh` | 刷新 Token | - | `{token}` |
| GET | `/api/auth/check-email` | 检查邮箱是否已注册 | `?email=xxx` | `{exists: boolean}` |

### DNS 凭据

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/dns-credentials` | 新增凭据 | `{name, provider, credentials}` | `{credential}` |
| GET | `/api/dns-credentials` | 凭据列表 | - | `{items: [...]}` （credentials 字段脱敏）|
| PUT | `/api/dns-credentials/:id` | 更新 | `{name?, credentials?}` | `{credential}` |
| DELETE | `/api/dns-credentials/:id` | 删除 | - | `204` 或 `409 有关联证书` |
| POST | `/api/dns-credentials/:id/verify` | 验证连通性 | - | `{valid, zone_count, zones, error?}` |
| GET | `/api/dns-credentials/:id/zones` | 获取该凭据下的域名 Zone 列表 | - | `{zones: [{name, id}]}` |

### 证书管理

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/certificates` | 添加域名 | `{domain, dns_credential_id, is_wildcard, auto_renew, renew_before_days, issue_now, webhook_ids?}` | `{certificate}` |
| GET | `/api/certificates` | 分页列表 | `?page&size&status&search&sort` | `{items, total, page, size}` |
| GET | `/api/certificates/:id` | 详情 | - | `{certificate}` （含完整信息）|
| PUT | `/api/certificates/:id` | 更新配置 | `{auto_renew?, renew_before_days?, webhook_ids?}` | `{certificate}` |
| DELETE | `/api/certificates/:id` | 删除 | - | `204` 或 `409 正在处理中` |
| GET | `/api/certificates/:id/status` | 轻量状态查询 | - | `{status, days_remaining, updated_at, current_step?}` |
| GET | `/api/certificates/summary` | 首页概览统计 | - | 见下方 |
| POST | `/api/certificates/renew` | 批量触发续期 | `{cert_ids: [...]}` | `{results: [{id, accepted, reason?}]}` |
| POST | `/api/certificates/:id/revoke` | 吊销证书 | `{reason}` | `{certificate}` |
| GET | `/api/certificates/:id/logs` | 续期日志 | `?page&size` | `{items, total}` |
| POST | `/api/certificates/check-domain` | 域名归属预检 | `{domain, dns_credential_id}` | `{valid, zone_name?, error?}` |

**`/api/certificates/summary` 响应结构**:

```json
{
  "total": 42,
  "by_status": {
    "active": 35,
    "pending_initial": 1,
    "pending_renewal": 2,
    "processing": 1,
    "failed": 2,
    "expired": 1,
    "revoked": 0
  },
  "expiring_7d": 3,
  "expiring_30d": 8,
  "recent_logs": [
    {
      "id": "...",
      "domain": "example.com",
      "trigger_type": "auto_cron",
      "result": "success",
      "finished_at": "2025-01-15T02:35:00Z",
      "duration_ms": 125000
    }
  ],
  "has_processing": true  // 前端用来判断是否启动轮询
}
```

### 证书下载（API Key 认证）

| 方法 | 路径 | 说明 | 认证方式 |
|------|------|------|---------|
| GET | `/api/v1/certificates/:domain/download?format=pem` | 下载最新有效证书 | Bearer API Key |
| GET | `/api/v1/certificates/:domain/download?format=pfx&password=xxx` | 下载 PFX 格式 | Bearer API Key |

### Webhook

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/webhooks` | 新增配置 |
| GET | `/api/webhooks` | 配置列表 |
| PUT | `/api/webhooks/:id` | 更新 |
| DELETE | `/api/webhooks/:id` | 删除 |
| POST | `/api/webhooks/:id/test` | 发送测试 Payload |
| GET | `/api/webhooks/:id/logs` | 推送日志 |

### API 密钥

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/api-keys` | 创建密钥（仅此时返回完整 Key，之后无法查看） |
| GET | `/api/api-keys` | 密钥列表（只显示前缀） |
| DELETE | `/api/api-keys/:id` | 删除 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/audit-logs` | 操作审计日志（分页） |
| GET | `/api/notifications` | 站内通知列表 |
| PUT | `/api/notifications/:id/read` | 标记已读 |
| GET | `/health` | 健康检查 |

---

## 第五部分：状态机完整定义

### 证书状态流转图

```
                     ┌─────────────────────────────────────────┐
                     │              用户添加域名                 │
                     └───────────────┬─────────────────────────┘
                                     │
                                     ▼
                             ┌───────────────┐
                  ┌──────────│pending_initial │ (选择"仅保存"时停在这里)
                  │          └───────┬───────┘
                  │                  │ 用户选择"保存并签发" 或 手动触发签发
                  │                  ▼
                  │          ┌───────────────┐
                  │          │pending_renewal│ ← ── 每日巡检发现临期
                  │          └───────┬───────┘       手动/批量续期触发
                  │                  │ Worker 取到任务
                  │                  ▼
                  │          ┌───────────────┐
                  │          │  processing   │
                  │          └──┬─────────┬──┘
                  │             │         │
                  │        成功 ▼         ▼ 失败
                  │    ┌──────────┐  ┌──────────┐
                  │    │  active  │  │  failed   │
                  │    └────┬─────┘  └─┬──────┬─┘
                  │         │          │      │
                  │         │    自动重试/手动重试
                  │         │          │
                  │         │     ┌────▼──────┐
                  │         │     │pending_   │ (回到队列)
                  │         │     │renewal    │
                  │         │     └───────────┘
                  │         │
                  │    到期未续期
                  │         │
                  │         ▼
                  │    ┌──────────┐
                  │    │ expired  │ ── 用户点击"重新签发" ──→ pending_renewal
                  │    └──────────┘
                  │
                  │  用户主动吊销（任何active/failed/expired状态均可触发）
                  │         │
                  │         ▼
                  │    ┌──────────┐
                  └───→│ revoked  │ (终态，需要用户手动重新签发才能回到流程)
                       └──────────┘
```

### 状态转换规则（白名单，未列出的转换一律禁止）

| 当前状态 | 允许转换到 | 触发条件 |
|---------|-----------|---------|
| pending_initial | pending_renewal | 用户触发签发 / 系统触发 |
| pending_renewal | processing | Worker 领取任务 |
| processing | active | Worker 签发成功 |
| processing | failed | Worker 签发失败 |
| active | pending_renewal | 巡检发现临期 / 手动续期 |
| active | revoked | 用户主动吊销 |
| active | expired | 巡检发现已过期且未续期 |
| failed | pending_renewal | 自动重试 / 手动重试 |
| failed | revoked | 用户主动吊销 |
| expired | pending_renewal | 用户点击"重新签发" |
| expired | revoked | 用户主动吊销 |
| revoked | pending_initial | 用户点击"重新签发"（重新走一遍完整流程） |

### 状态转换的数据库操作要求

每次状态转换必须：
1. 使用数据库事务（transaction）
2. 带乐观锁（WHERE status = '当前状态'），防止并发修改
3. 写入 `audit_logs` 表记录操作人和操作时间
4. 如果涉及续期，同步写入 `renewal_logs`

示例伪代码:
```sql
UPDATE certificates 
SET status = 'processing', updated_at = NOW()
WHERE id = :id AND status = 'pending_renewal'  -- 乐观锁
RETURNING *;
-- 如果影响行数为 0，说明状态已被其他 Worker 改变，跳过此任务
```

---

## 第六部分：通知系统设计

原始 PRD 中完全没有提及给用户的通知机制。Webhook 是给机器的，但用户自己也需要知道发生了什么。

### 通知触发规则

| 事件 | 通知渠道 | 触发条件 |
|------|---------|---------|
| 证书即将到期 | 邮件 + 站内 | 到期前 7 天，每天巡检时触发一次（不重复发送同一天的） |
| 证书续期成功 | 站内 | 每次成功 |
| 证书续期失败 | 邮件 + 站内 | 每次失败（邮件聚合：同一小时内的失败合并为一封） |
| 证书已过期 | 邮件 + 站内 | 过期当天 |
| 连续失败需人工介入 | 邮件 | 连续失败 3 次 |
| DNS 凭据即将过期 | 站内 | 如果凭据验证失败（可能已被撤销） |
| Webhook 连续推送失败 | 站内 | 连续 5 次推送失败时 |

### 站内通知 UI

**位置**: 顶部导航栏右侧，铃铛图标 + 未读数量红点

**点击铃铛**: 展开下拉通知面板（最近 20 条），每条显示：
- 图标（成功 ✓ / 失败 ✗ / 警告 ⚠）
- 摘要文案
- 时间（相对时间，如 "5 分钟前"）
- 未读标记（左侧蓝色圆点）
- 点击跳转到对应证书详情页

**底部**: "查看全部通知" 链接，跳转到 `/notifications` 完整通知列表页。

---

## 第七部分：任务拆分（按模块）

> 以下任务基于前面所有设计内容拆分，每个任务包含交互层、接口层、数据层的完整实现范围。

### 模块 A：基础设施

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| A1 | 后端项目初始化 + 中间件体系 | Express/Koa 骨架 + 全局错误处理 + 请求校验 (Zod) + CORS + Helmet + 请求日志 + 统一响应格式封装 | 无 | 0.5d |
| A2 | 数据库 + ORM 搭建 | Prisma 接入 + 全部表结构 migration（按第三部分 schema） + 加密工具函数（AES-256-GCM 封装 encrypt/decrypt） | A1 | 1d |
| A3 | Redis + BullMQ 队列基础 | Redis 连接 + `certificate-renewal` 队列 + 指数退避重试策略 + 死信队列 + 并发控制 (concurrency=3) | A1 | 0.5d |
| A4 | 前端项目初始化 + Layout 骨架 | Next.js App Router + Tailwind + shadcn/ui + 全局 Layout（侧边栏导航 + 顶栏 + 内容区）+ Axios 封装（自动附 Token、统一错误拦截、401 自动跳登录）+ Zustand 全局状态 | 无 | 1d |
| A5 | 用户认证（全栈） | 注册/登录/登出 API + JWT 签发与刷新 + 登录失败锁定 + 前端登录页/注册页/路由守卫 + 审计日志埋点 (user.login/logout) | A1,A2,A4 | 1.5d |

### 模块 B：DNS 凭据管理

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| B1 | DNS 凭据 CRUD API | 4 个 RESTful 接口 + 加密存储 + 删除时检查关联证书 + 审计日志 | A2,A5 | 0.5d |
| B2 | DNS 服务商适配器（策略模式） | `CloudflareDnsProvider` / `AliDnsProvider` / `DnsPodProvider`，统一接口：`listZones()` / `addTxtRecord()` / `removeTxtRecord()` / `verifyCredentials()` | B1 | 1.5d |
| B3 | 凭据验证 + Zone 查询 API | `POST /:id/verify` + `GET /:id/zones` 接口，调用 B2 适配器 | B2 | 0.5d |
| B4 | 凭据管理前端页面 | 列表表格 + 新增/编辑弹窗（按服务商动态表单）+ 连通性测试按钮 + 删除确认 | A4,B1,B3 | 1d |

### 模块 C：ACME 引擎

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| C1 | ACME 客户端服务 | `AcmeService` 类：创建/加载账户、发起订单、获取 Challenge、提交验证、下载证书。默认 Staging 环境。含 ACME 账户密钥持久化到 `acme_accounts` 表 | A2 | 1.5d |
| C2 | DNS 预查询验证器 | `DnsVerifier` 类：向 8.8.8.8 / 1.1.1.1 轮询 TXT 记录，10 秒间隔，最长 5 分钟超时 | 无 | 0.5d |
| C3 | Worker 续期执行器 | BullMQ Worker 完整流程（第二部分旅程一步骤 3 的 10 个步骤）+ 每步写入 renewal_logs.steps + 失败错误翻译（第二部分旅程四的映射表）+ finally 清理 TXT 记录 | A3,C1,C2,B2 | 2d |
| C4 | 定时巡检 Cron | 每日 02:00 巡检：筛选临期证书 → 更新状态 → 推入队列。标记已过期证书。过滤冷却期内的 failed 证书 | A3,A2 | 0.5d |
| C5 | 速率限制防护层 | Redis 计数器（每域名/小时申请次数）+ 指数退避冷却 + 周限额检测 + 超限自动暂停并记录 | A3,C3 | 0.5d |

### 模块 D：证书管理（全栈）

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| D1 | 证书 CRUD + 状态查询 API | 证书增删改查 + 状态查询 + 概览统计 + 域名归属预检接口 + 状态转换乐观锁 + 审计日志 | A2,A5,B1 | 1d |
| D2 | 手动/批量续期 API | `POST /renew` 接口：状态校验 + 冷却期校验 + 推入队列 + 逐条返回受理结果 | D1,A3 | 0.5d |
| D3 | 证书吊销 API | `POST /:id/revoke`：调用 ACME 吊销 → 更新状态为 revoked → 触发 Webhook → 审计日志 | D1,C1 | 0.5d |
| D4 | 证书下载 API（双认证） | Session 认证的下载（前端详情页用）+ API Key 认证的 `/api/v1/certificates/:domain/download`（外部脚本用），支持 PEM / PFX / Nginx 配置片段 | D1 | 1d |
| D5 | 证书列表页（前端） | 数据表格 + 状态视觉映射 + 筛选/搜索 + 批量 Checkbox + 空状态引导。按第二部分旅程二的交互规格实现 | A4,D1 | 1.5d |
| D6 | 单行/批量续期交互（前端） | 续期按钮禁用逻辑 + 批量确认弹窗 + Toast 反馈 + 轮询状态更新 + visibilitychange 优化 | D5,D2 | 1d |
| D7 | 证书详情页（前端） | 信息面板 + 证书内容（私钥二次确认）+ 下载按钮组 + 续期日志时间线 + 吊销操作 + 操作区按钮 | D5,D4,D3 | 1.5d |
| D8 | 添加域名抽屉（前端） | Drawer 表单 + 凭据选择 + 域名归属预检 + 泛域名 Toggle + 高级选项折叠 + "保存并签发"/"仅保存" 双模式 | D5,D1,B3 | 1d |

### 模块 E：新手引导

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| E1 | Onboarding Wizard 页面 | 3 步向导（选服务商 → 填凭据并验证 → 添加域名并签发）+ 步骤进度条 + 签发等待进度展示 + 成功/失败页面。按第二部分旅程一的完整交互规格实现 | A4,B3,D1,D2 | 2d |
| E2 | 首次签发进度推送 | 后端：Worker 在每个步骤完成时更新 renewal_logs.steps；前端：轮询 `/api/certificates/:id/status` 获取 current_step，映射为步骤进度条 | C3,E1 | 0.5d |

### 模块 F：Dashboard 首页

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| F1 | 首页 UI 实现 | 统计卡片组 + 一键续期/重试按钮交互 + 即将到期列表 + 最近活动时间线 + 智能轮询机制 | A4,D1,D2 | 1.5d |

### 模块 G：Webhook + 通知

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| G1 | Webhook 配置 CRUD + 推送引擎 | 配置接口 + 事件分发服务 + HMAC 签名 + 重试机制 (3次) + 连续失败自动禁用 + 推送日志 | A2,A5 | 1.5d |
| G2 | Webhook 管理前端页面 | 配置列表 + 新增/编辑表单 + 测试推送按钮 + 推送日志查看 | A4,G1 | 1d |
| G3 | 站内通知系统 | notifications 表 + 触发规则实现（续期成功/失败/即将到期）+ 前端铃铛组件 + 通知面板 + 已读标记 | A2,A4,C3,C4 | 1.5d |
| G4 | 邮件通知 | 邮件发送服务（Nodemailer/第三方）+ 邮件模板（到期预警/续期失败/需人工介入）+ 同小时聚合逻辑 + 用户通知偏好设置 | A2,C3,C4 | 1d |

### 模块 H：设置与安全

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| H1 | API 密钥管理（全栈） | 创建/列表/删除接口 + 前端设置页 + Key 仅创建时显示一次 + 权限范围选择 | A2,A5,A4 | 1d |
| H2 | 操作审计日志页面 | 前端审计日志列表页（按时间筛选/按操作类型筛选）+ API | A2,A4 | 0.5d |
| H3 | ACME 环境切换 | 设置页中的 Staging/Production 切换 + 切换时的确认提示 + 切换后自动创建新 ACME 账户 + 提示用户需要重签所有证书 | A4,C1 | 0.5d |

### 模块 I：部署

| ID | 任务 | 产出 | 依赖 | 估时 |
|----|------|------|------|------|
| I1 | Docker 容器化 | Dockerfile × 3 (api + worker + web) + docker-compose.yml（含 postgres + redis）+ .env.example + 健康检查接口 | 全部 | 1d |
| I2 | 生产就绪检查 | Staging → Production 切换文档 + 数据备份策略文档 + 监控接口 (/health, /metrics) | I1 | 0.5d |

---

## 第八部分：里程碑与执行顺序

### M0 — 基座搭建 (3.5d)
> 目标：前后端跑起来，能注册登录，数据库和队列就绪

A1 → A2 → A5 (后端线)
A4 (前端线，并行)
A3 (队列，并行)

### M1 — 最小闭环：签发一张证书 (5.5d)
> 目标：用户能通过引导页完成第一张证书的签发并下载

B1 → B2 → B3 (DNS 适配器线)
C1 → C2 → C3 (ACME 引擎线)
D1 → D2 (证书 API)
B4 (凭据前端页)
E1 → E2 (引导页)

验收标准：一个新用户注册后，能通过引导完成 Cloudflare 凭据添加 → 域名验证 → 证书签发 → 下载 PEM 文件。全程 Staging 环境。

### M2 — 管理能力完整 (5.5d)
> 目标：前端管理界面完整可用，支持日常操作

D5 → D6 → D7 → D8 (证书管理全套前端)
F1 (Dashboard 首页)
D3 → D4 (吊销 + 下载)

验收标准：用户能在管理界面查看所有证书状态、手动/批量续期、查看日志、下载证书。

### M3 — 自动化与通知 (5d)
> 目标：系统能自动续期、自动通知，无需人工干预

C4 → C5 (巡检 + 速率限制)
G1 → G2 (Webhook)
G3 → G4 (通知系统)

验收标准：添加一个即将到期的证书（Staging 环境手动设置到期时间），系统自动巡检并续期，用户收到邮件和站内通知。

### M4 — 安全加固与部署 (2.5d)
> 目标：可以部署到生产环境

H1 → H2 → H3 (设置与安全)
I1 → I2 (容器化与上线)

验收标准：`docker compose up` 一键启动全部服务。切换到 Production 环境后能正常签发真实证书。

### 总计：~22 个工作日（1 人）

---

## 第九部分：落地 Review — 现在能不能被完整实现

以下是对整个设计的自查，列出仍需注意的风险点和待决策项：

### 必须在开发前确认的决策

1. **MVP 是否需要多用户协作？** 当前设计了 `role` 字段但没有展开权限控制。如果 MVP 只需单用户，可以去掉 role 和权限校验，降低复杂度。建议 MVP 单用户，V2 加多用户。

2. **邮件服务怎么发？** 需要确定使用自建 SMTP、还是第三方服务（SendGrid / AWS SES / Resend）。这决定了 G4 任务的实现方式和是否需要额外的账号配置。

3. **ACME 账户策略：共享还是独立？** 当前设计为每用户独立账户。好处是速率限制隔离，坏处是管理复杂。如果 MVP 只有少量用户，可以先用系统全局账户，V2 再改为独立账户。

4. **PFX 导出的密码交互**：当前设计让用户在下载时输入密码。需要确认前端是直接把密码发给后端（后端生成 PFX 返回），还是先下载 PEM 后前端 wasm 生成 PFX（更安全但更复杂）。建议 MVP 用前者。

### 技术风险

1. **DNS 服务商 API 差异大**：三个服务商的 API 风格完全不同（Cloudflare RESTful、阿里云 RPC 签名、腾讯云 TC3 签名），B2 任务的实际工作量可能比预估大。建议 MVP 先只做 Cloudflare，验证核心流程后再扩展。

2. **BullMQ Worker 进程管理**：Worker 作为独立进程运行，需要处理优雅关闭（收到 SIGTERM 时等待当前任务完成再退出）、Worker 崩溃后任务状态修复（`processing` 状态但 Worker 已死的记录需要被巡检任务识别并重置）。这些需要在 C3 中明确处理。

3. **DNS 记录清理的可靠性**：如果 Worker 在添加 TXT 记录后崩溃，TXT 记录会残留。需要一个定期清理任务扫描 `processing` 超过 30 分钟的记录，尝试清理其 DNS 记录。建议在 C4 巡检任务中增加此逻辑。

4. **证书私钥的安全性**：当前设计将私钥加密后存在数据库中。如果数据库和加密密钥同时泄露，所有私钥暴露。更安全的方案是使用独立的密钥管理服务（如 AWS KMS / HashiCorp Vault），但增加了运维复杂度。建议 MVP 用本地加密，文档中标注生产环境建议接入 KMS。

