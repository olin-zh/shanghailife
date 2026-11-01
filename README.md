# Shanghai Life

以上海为背景的模拟人生网页游戏：3D 城市地图、邮箱或 X 账号登录、云存档、实时多人（看到其他玩家、全城聊天、挥手、送红包、邀请一起做事）。

## 技术栈
- Next.js 15 + React 19 + Three.js
- 部署：Cloudflare Workers（通过 OpenNext）
- 数据库：Cloudflare D1（账号、会话、存档）
- 实时多人：Cloudflare Durable Objects + WebSocket（`worker.ts` 里的 `CityRoom`）

## 防作弊设计
- 登录玩家的存档只在服务器上：所有操作（坐地铁、做事、上班领工资、开新游戏）都发到 `/api/game`，由服务器用 `lib/game.ts` 计算后写进 D1，浏览器只显示结果。
- 存档带版本号（`lib/store.ts`），同时来的请求不会互相覆盖。
- 红包和一起做事由多人房间（`worker.ts`）直接改双方存档：先扣钱再加钱，钱不够、人不在同一地点、邀请过期或被重复接受都会被拒绝。
- 玩家所在位置以服务器存档为准，浏览器发来的位置不被采信。
- 游客存档只在浏览器本地；登录时导入游客存档会把钱包和日子重置。

## 本地运行
```bash
npm install
npm run db:local                 # 建本地数据库（含所有迁移）
npx opennextjs-cloudflare build
npx wrangler dev                 # http://localhost:8787 ，多人功能需要用这个方式跑
```
`npm run dev` 只能调地图和单人玩法，没有多人。

## 部署到 Cloudflare（准备上线时）
1. `npx wrangler login`
2. `npx wrangler d1 create shanghailife`，把返回的 `database_id` 填进 `wrangler.jsonc`
3. `npx wrangler d1 migrations apply shanghailife --remote`（会依次执行 migrations 目录里的所有文件）
4. `npm run deploy`
5. 在 Cloudflare 后台给 Worker 绑定自定义域名 shanghailife.app

## X 登录
代码已完成（OAuth 2.0 + PKCE）。开通步骤：
1. 在 X 开发者后台建 App，类型选 Web App，回调地址填 `https://shanghailife.app/auth/x/callback`
2. 在 Cloudflare 后台给 Worker 加两个 Secret：`X_CLIENT_ID`、`X_CLIENT_SECRET`（或 `npx wrangler secret put X_CLIENT_ID`）
3. 配好后登录框里会自动出现「用 𝕏 账号登录」按钮；没配时不显示

本地测试 X 登录：在 `.dev.vars` 里填 `X_CLIENT_ID`、`X_CLIENT_SECRET`，以及指向模拟服务器的 `X_AUTH_BASE`、`X_API_BASE`。线上不要设置这两个 BASE。

## 目录
- `lib/game.ts` 游戏规则（地点、行动、事件、存档结构）
- `lib/city.ts` 3D 地图
- `components/Game.tsx` 界面、登录、聊天、联网
- `app/api/*` 登录、存档接口
- `lib/xauth.ts`、`app/api/auth/x`、`app/auth/x/callback` X 登录
- `worker.ts` Worker 入口和多人房间（聊天、挥手、红包、一起做事都在这里转发和校验）
- `migrations/` 数据库表结构
