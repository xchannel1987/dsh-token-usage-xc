# dsh-token-usage

DSH（DeepSeek Harness）Web 插件：**今日 Token 用量统计**（按模型 + 总计）。

在设置页新增分区「今日 Token 用量」：实时统计**当天** DSH 在全部会话（主会话 + 子代理会话）中
消耗的 token，按模型分桶展示输入 / 输出 / 缓存读 / 缓存命中率 / 合计 / 次数，并给出当日总计与最近 7 日按模型堆叠趋势图。
可选在会话顶栏常驻一个总 token 徽标（默认关闭）。

## 数据来源（复用 DSH 现有机制，不直接解析会话日志）

- **实时捕获**：宿主侧监听 `session/event`（与 `dsh-token-meter` 同款捕获面），折叠
  `assistant/message` 事件的 `usage`（provider 报告值）。
- **模型归属**：直接读事件自带的 `message.source.model` / `.provider`，无需额外状态。
- **按天落盘**：写入 `~/.dsh/storages/dsh-token-usage/<YYYY-MM-DD>.json`（含会话水位），
  重启不丢、跨天自动切换、7 天自动清理。
- **启动回填**：经 `ctx.sessionQuery.listSessions()` + `readSession()`（持久化正规读取路径，
  正确处理多帧 zstd）回填今天早于插件加载的用量，按会话 seq 水位去重，绝不重复计数。
- **对外提供**：宿主 RPC 通道 `/dsh-token-usage`（端点 `today`、`last7days`），浏览器端轮询渲染。

> 为什么不自己解析 `session.jsonl.zstd`：该文件是**多 zstd 帧拼接**（每次 append 一帧），
> 单次解压只能解出第一帧；正确读法要像持久化后端那样扫描帧边界逐帧解码并处理
> checksum / 打包行 / 崩溃修复。插件统一走 `sessionQuery`，避免重复实现这套逻辑。

## 统计口径

- `total = uncachedInput + cacheRead + cacheWrite + output`（与 DSH `tokenUsage` 投影一致）。
- 前端缓存命中率：`cacheRead / (uncachedInput + cacheRead) × 100%`；分母为 0 显示 `—`。
- Token 数量使用紧凑格式：`K/M/B`，悬停 tooltip 显示完整精确值。
- 前端缓存命中率：`cacheRead / (uncachedInput + cacheRead) × 100%`；分母为 0 显示 `—`。
- Token 数量使用紧凑格式：`K/M/B`，悬停 tooltip 显示完整精确值。
- 只折叠 `assistant/message` 的最终 usage：每一步恰好一条、自带最终账单值，天然无重复；
  被中断的回合也产生带 usage 的 `assistant/message`，正常计入；失败无消息的请求不产生
  usage，自然排除。
- 按 `event.time`（本地时区）归到 `YYYY-MM-DD`。
- 模型维度 key 是事件自带的模型 id（`message.source.model`）；展示时优先解析配置的显示名
  （经 `ctx.llm` 的模型服务，如 settings 里配置的 `name`），解析不到/服务不可用时回退原始 id。

## 数据接口

浏览器 → host RPC：`POST /dsh-token-usage/today` 和 `POST /dsh-token-usage/last7days`（channel 由插件注册，`authority: trusted-host`）。

```ts
{
  available: boolean;
  date: string;                 // 'YYYY-MM-DD'
  generatedAt: string;          // ISO
  totalTokens: number;
  requests: number;
  backfillDone: boolean;
  sessionQueryAvailable: boolean;
  models: {
    model: string;              // 模型 id（provider/model 原样）
    modelName: string | null;   // 配置的显示名（经 llm 服务解析，无则 null）
    provider: string;
    uncachedInputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    requests: number;
  }[];
}
```

## 配置字段（settings 命名空间 `dsh-token-usage`）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `refreshIntervalSec` | `60` | 前端轮询间隔（10–3600 秒） |
| `backfill` | `true` | 启动时回填今日用量（需 sessionQuery） |
| `headerBadge` | `false` | 会话顶栏显示今日总 token 徽标 |

## 安装

### 方式 A：本地打包安装（推荐）

```powershell
cd D:\workspace\dsh-token-usage
.\build.ps1                            # npm pack 生成 .tgz
dsh plugin --profile web add dsh-token-usage@file:D:\workspace\dsh-token-usage\dsh-token-usage-0.2.1.tgz
```

安装后确认 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 包含 `dsh-token-usage`，
然后**重启 `dsh web`** 生效。

### 方式 B：直接编辑 profile（无需打包）

1. 把本目录作为一个包加入 profile：
   ```powershell
   dsh plugin --profile web add dsh-token-usage@file:D:\workspace\dsh-token-usage
   ```
2. 若用 `file:` 指向目录，先执行 `npm pack` 并在 profile 的 `package.json` 里写：
   ```json
   "dsh-token-usage": "file:D:/workspace/dsh-token-usage/dsh-token-usage-0.2.0.tgz"
   ```
3. 确认 `dsh.profile.bundles` 列表、重启 `dsh web`。

## 使用

1. 打开 DSH 设置 → 「插件 → 插件配置」或左侧「今日 Token 用量」分区。
2. 查看当天按模型的 token 明细与总计；点「刷新」立即刷新（默认每 60s 自动刷新）。
3. 可选在配置里打开「会话顶栏显示今日总 token」，之后会话顶栏出现常驻徽标，点击可看明细。

## 项目结构

```
lib/index.js    # Host 插件：settings 命名空间 + session/event 累计 + 按天落盘 + 启动回填 + /dsh-token-usage RPC
lib/client.js   # 浏览器 bundle：设置页分区 + 可选顶栏徽标 + 轮询 + 明细表格
cordis.patch.yml # bundle 加载补丁（- insert）
build.ps1       # 打包 tgz
```

## 卸载

```powershell
dsh plugin --profile web remove dsh-token-usage
```

## License

MIT