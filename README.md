# 考研规划打卡 App

面向法学考研学生的学习规划与每日打卡 Web App。学生可以管理每日任务、提交打卡、查看考研倒计时、生成一周计划并阅读监督留言；监督用户可以查看学习记录、统计图和留言已读状态。

## 技术栈

- 前端：React + TypeScript + Vite + Tailwind CSS
- 后端：Node.js + Express + TypeScript
- 数据库：PostgreSQL
- ORM：Prisma
- 登录：JWT + bcrypt

## 部署结构

```text
Vercel              前端静态站点
Render / Railway    Express API 服务
PostgreSQL          云数据库
```

本地开发也使用 PostgreSQL，通过 `docker-compose.yml` 启动。这样本地和生产环境的 Prisma schema 保持一致。

## 环境变量

根目录 `.env.example` 是总览。本地实际加载：

- 后端：`server/.env`
- 前端：`client/.env`

复制示例：

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

后端本地 `server/.env`：

```bash
NODE_ENV=development
DATABASE_URL="postgresql://kaoyan:kaoyan_password@localhost:5432/kaoyan_planner?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=4000
CLIENT_URL="http://localhost:5173,http://127.0.0.1:5173"
```

前端本地 `client/.env`：

```bash
VITE_API_BASE_URL="http://localhost:4000"
```

生产后端环境变量：

```bash
NODE_ENV=production
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
JWT_SECRET="replace-with-a-long-random-production-secret"
PORT=4000
CLIENT_URL="https://your-frontend-domain.vercel.app"
```

生产前端环境变量：

```bash
VITE_API_BASE_URL="https://your-backend-domain.onrender.com"
```

注意：

- `JWT_SECRET` 必须来自环境变量，生产环境必须改成强随机字符串。
- `CLIENT_URL` 控制后端 CORS 白名单，本地写本地前端地址，生产写 Vercel 域名。
- 前端 API 地址通过 `VITE_API_BASE_URL` 注入，代码里没有写死 localhost。这里填写后端根地址即可，前端会自动请求 `/api` 路径。

## 本地运行

1. 安装依赖：

```bash
npm run install:all
```

2. 启动本地 PostgreSQL：

```bash
docker compose up -d postgres
```

如果不使用 Docker，也可以用本机 PostgreSQL 创建数据库，并把 `server/.env` 的 `DATABASE_URL` 改成自己的连接串：

```bash
createdb kaoyan_planner
```

3. 初始化数据库：

```bash
npm run db:push
npm run db:seed
```

也可以使用 Prisma 原生命令：

```bash
npx prisma db push
npx prisma db seed
```

4. 启动开发服务：

```bash
npm run dev
```

访问：

- 前端：http://localhost:5173
- 后端：http://localhost:4000

默认测试账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 学生 | student | 123456 |
| 监督 | supervisor | 123456 |

seed 中密码使用 bcrypt 加密存储，不会明文保存。

## 常用命令

```bash
npm run install:all
npm run dev
npm run dev:server
npm run dev:client
npm run build
npm run start
npm run db:push
npm run db:migrate
npm run db:seed
```

说明：

- `db:push`：适合 MVP、本地开发、首次试部署，直接同步 schema。
- `db:migrate`：执行已有 Prisma migration，更适合正式生产。
- `db:seed`：写入测试账号和模板数据。真实使用后不要随意执行，因为当前 seed 会清理并重建测试数据。

## 构建与启动

前后端一起构建：

```bash
npm run build
```

只构建后端：

```bash
npm --workspace server run build
```

启动已构建后端：

```bash
npm start
```

后端监听端口使用 `process.env.PORT`，适配 Render/Railway 自动分配端口。

## 部署 PostgreSQL

Render：

1. 新建 PostgreSQL 服务。
2. 复制 Internal Database URL 或 External Database URL。
3. 将连接串设置为后端服务的 `DATABASE_URL`。

Railway：

1. 新建 PostgreSQL 插件。
2. 在 Variables 中复制 `DATABASE_URL`。
3. 将该值配置给后端服务。

生产初始化数据库：

```bash
npx prisma db push
npx prisma db seed
```

如果使用 migration：

```bash
npm run db:migrate
npm run db:seed
```

真实数据开始使用后，不要再执行 seed。

## 部署后端到 Render

1. 在 Render 新建 Web Service，连接仓库。
2. Root Directory 使用仓库根目录。
3. Build Command：

```bash
npm install --workspaces --include-workspace-root && npm --workspace server run build
```

4. Start Command：

```bash
npm --workspace server run start
```

5. 设置环境变量：

```bash
NODE_ENV=production
DATABASE_URL=你的 PostgreSQL 连接串
JWT_SECRET=你的强随机密钥
CLIENT_URL=https://你的前端域名.vercel.app
```

6. 部署完成后访问：

```bash
https://your-backend-domain.onrender.com/api/health
```

返回 `{"ok":true}` 表示后端在线。

## 部署后端到 Railway

1. 新建 Railway Project。
2. 添加 PostgreSQL。
3. 添加后端服务并连接仓库。
4. Build Command：

```bash
npm install --workspaces --include-workspace-root && npm --workspace server run build
```

5. Start Command：

```bash
npm --workspace server run start
```

6. 设置环境变量：

```bash
NODE_ENV=production
DATABASE_URL=Railway PostgreSQL DATABASE_URL
JWT_SECRET=你的强随机密钥
CLIENT_URL=https://你的前端域名.vercel.app
```

Railway 会提供公网后端域名，前端的 `VITE_API_BASE_URL` 要指向后端根地址：

```bash
https://your-railway-backend-domain.up.railway.app
```

## 部署前端到 Vercel

1. 在 Vercel 新建项目，连接仓库。
2. Root Directory 设置为 `client`。
3. Build Command：

```bash
npm run build
```

4. Output Directory：

```bash
dist
```

5. 设置环境变量：

```bash
VITE_API_BASE_URL=https://your-backend-domain.com
```

6. 重新部署前端。

如果后端域名变化，只需要更新 Vercel 中的 `VITE_API_BASE_URL` 并重新部署。

## 权限与安全

- 登录使用 JWT，token 保存在前端本地存储中，用于保持登录状态。
- token 过期或无效时，前端会清除登录状态并回到登录页。
- student 和 supervisor 的 API 在后端都做了角色校验。
- supervisor 只能查看学习记录和留言状态，不能修改学生任务。
- 前端不暴露 `JWT_SECRET`、数据库连接串等敏感信息。
- 测试账号仅用于首次试用，真实使用前请修改默认密码。

## 部署后测试

1. 打开 Vercel 前端公网地址。
2. 使用 `student / 123456` 登录。
3. 检查是否能看到今日计划、倒计时和留言。
4. 添加或完成一个任务，提交今日打卡。
5. 退出登录。
6. 使用 `supervisor / 123456` 登录。
7. 检查监督后台是否能看到 student 的今日打卡、学习时长、完成科目和历史记录。
8. 发送一条留言，再用 student 登录确认能看到。

## 常见问题

### 前端能打开但接口失败

检查 Vercel 的 `VITE_API_BASE_URL` 是否是后端公网根地址，例如 `https://your-backend-domain.onrender.com`。前端会自动拼接 `/api`。

### 后端跨域报错

检查 Render/Railway 的 `CLIENT_URL` 是否等于 Vercel 前端域名。多个允许域名用英文逗号分隔。

### 登录提示用户不存在

说明数据库没有 seed：

```bash
npx prisma db push
npx prisma db seed
```

### PostgreSQL 连接失败

检查 `DATABASE_URL` 是否来自同一个部署平台的 PostgreSQL 服务，用户名、密码、host、端口和数据库名是否完整。

### 修改环境变量后没有生效

Vercel、Render、Railway 修改环境变量后通常需要重新部署或重启服务。

## 当前 TODO

- 正式注册、修改密码和找回密码。
- 更完整的生产 migration 流程。
- 日志、监控和错误追踪。
- 移动端 App、提醒通知和更多统计维度。
