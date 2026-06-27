# 考研规划打卡 App

面向法学考研学生的学习规划与每日打卡 Web App。学生可以注册账号、管理学习任务、提交打卡、生成一周计划、查看考研倒计时，并通过绑定码邀请监督者查看学习记录和发送留言。

## 技术栈

- 前端：React + TypeScript + Vite + Tailwind CSS + PWA
- 后端：Node.js + Express + TypeScript
- 数据库：Render PostgreSQL / 本地 PostgreSQL
- ORM：Prisma
- 登录：JWT + bcrypt

## 项目结构

```text
client/                Vercel 前端
server/                Render 后端 Root Directory
server/prisma/         Prisma schema 与 seed
server/prisma/schema.prisma
server/prisma/seed.ts
```

注意：当前 Render 后端 Root Directory 是 `server`，Prisma 文件也在 `server/prisma`。不要把 Prisma 文件移动到项目根目录。

## 核心账号逻辑

- 用户可以自行注册 `student` 账号。
- 注册 `supervisor` 账号必须输入监管者内码，当前默认内码通过 `SUPERVISOR_REGISTER_CODE` 配置。
- 注册和 seed 的密码都会通过 bcrypt 哈希后保存。
- 学生生成绑定码，监督者输入绑定码后建立绑定关系。
- 监督者只能查看已绑定学生的数据，不能默认查看所有学生。
- seed 仍保留测试账号 `student / 123456` 和 `supervisor / 123456`，方便开发验证。

## 环境变量

后端 `server/.env`：

```bash
NODE_ENV=development
DATABASE_URL="postgresql://kaoyan:kaoyan_password@localhost:5432/kaoyan_planner?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
SUPERVISOR_REGISTER_CODE=260327
PORT=4000
CLIENT_URL="http://localhost:5173,http://127.0.0.1:5173"
```

前端 `client/.env`：

```bash
VITE_API_BASE_URL="http://localhost:4000"
```

生产环境：

```bash
NODE_ENV=production
DATABASE_URL="Render PostgreSQL Internal Database URL"
JWT_SECRET="replace-with-a-long-random-production-secret"
SUPERVISOR_REGISTER_CODE=260327
CLIENT_URL="https://your-vercel-app.vercel.app"
```

```bash
VITE_API_BASE_URL="https://your-render-api.onrender.com"
```

`VITE_API_BASE_URL` 填后端根地址即可，前端会自动请求 `/api` 路径。

## 本地运行

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run install:all
docker compose up -d postgres
npm run db:push
npm run db:seed
npm run dev
```

访问：

- 前端：http://localhost:5173
- 后端：http://localhost:4000

## Render 后端部署

Render Web Service：

```text
Root Directory: server
```

Build Command：

```bash
npm install --include=dev && npx prisma generate && npm run build
```

Start Command：

```bash
npx prisma db push && npm start
```

环境变量：

```bash
NODE_ENV=production
DATABASE_URL=Render PostgreSQL Internal Database URL
JWT_SECRET=你的强随机密钥
SUPERVISOR_REGISTER_CODE=260327
CLIENT_URL=https://你的-vercel-前端域名.vercel.app
```

部署到 Render 后，请进入：

```text
Render -> qtt-kaoyan-server -> Environment
```

新增：

```bash
SUPERVISOR_REGISTER_CODE=260327
```

然后重新部署后端。

健康检查：

```bash
https://你的-render-后端域名.onrender.com/api/health
```

返回 `{"ok":true}` 表示后端正常。

## Render PostgreSQL

1. 在 Render 创建 PostgreSQL。
2. 复制 Internal Database URL。
3. 填到后端服务的 `DATABASE_URL`。
4. 后端启动命令会执行：

```bash
npx prisma db push
```

如果需要测试账号，可以在 Render Shell 或本地连接生产库后手动执行：

```bash
npx prisma db seed
```

当前 seed 使用 upsert，不会因为重复执行导致唯一键冲突；默认测试账号存在时，会把密码重置为 `123456` 对应的 bcrypt 哈希。

## Vercel 前端部署

```text
Root Directory: client
Build Command: npm run build
Output Directory: dist
```

环境变量：

```bash
VITE_API_BASE_URL=https://你的-render-后端域名.onrender.com
```

修改环境变量后需要重新部署前端。

生产构建会自动生成 PWA 相关文件，包括 `manifest.webmanifest` 和 service worker。普通浏览器访问不受影响，手机浏览器可以将 Vercel 页面添加到主屏幕。

## 移动端 PWA 使用

这是一个 PWA，不需要从 App Store 或应用商店下载。手机添加到主屏幕后，会像独立 App 一样打开；学习任务、打卡和留言仍需要联网同步到云端。

iPhone：

1. 用 Safari 打开 Vercel 前端网址。
2. 点击浏览器底部或顶部的分享按钮。
3. 选择“添加到主屏幕”。
4. 桌面会出现“考研计划”图标。

Android：

1. 用 Chrome 打开 Vercel 前端网址。
2. 点击浏览器菜单。
3. 选择“安装应用”或“添加到主屏幕”。
4. 桌面会出现“考研计划”图标。

本地测试 PWA：

```bash
cd client
npm run build
npm run preview
```

然后用浏览器访问 preview 地址。PWA 安装能力通常需要 HTTPS 或 localhost 环境；线上 Vercel 默认是 HTTPS，可以直接测试添加到主屏幕。

## 部署后测试

1. 打开 Vercel 前端地址。
2. 注册一个学生账号，登录后进入“绑定监督者”，生成绑定码。
3. 注册一个监督者账号，进入“绑定学生”，输入绑定码。
4. 学生添加任务并提交打卡。
5. 监督者进入后台，确认能看到已绑定学生的打卡记录、统计和留言状态。
6. 监督者发送留言，学生登录后确认能看到并标记已读。

也可以使用测试账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 学生 | student | 123456 |
| 监督 | supervisor | 123456 |

seed 会默认为这两个测试账号建立绑定关系，方便快速验收。

## 常见问题

### 注册或登录失败

确认 Render 后端环境变量中已经设置：

```bash
DATABASE_URL
JWT_SECRET
CLIENT_URL
```

并确认 Render 日志里 `npx prisma db push` 没有失败。如果依赖测试账号，再手动执行 `npx prisma db seed`。

### 监督后台看不到数据

新账号必须先绑定学生。学生生成绑定码，监督者输入绑定码后才有权限查看。

### CORS 报错

检查后端 `CLIENT_URL` 是否等于 Vercel 前端域名。多个地址用英文逗号分隔。

### 前端接口地址错误

检查 Vercel 的 `VITE_API_BASE_URL` 是否是 Render 后端根地址，例如：

```bash
https://your-api.onrender.com
```

不要填前端地址。

### Prisma 找不到 schema

确认 Render 后端 Root Directory 是 `server`。当前 Prisma 文件位置是：

```text
server/prisma/schema.prisma
server/prisma/seed.ts
```

在 `server` 目录下执行 `npx prisma generate`、`npx prisma db push`、`npx prisma db seed` 会自动使用这些文件。

## TODO

- 修改密码和找回密码。
- 多学生切换 UI。
- 更正式的 Prisma migration 流程。
- 日志、监控和错误追踪。
