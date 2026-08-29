# dsh-token-usage-xc

[![npm version](https://img.shields.io/npm/v/dsh-token-usage-xc.svg)](https://www.npmjs.com/package/dsh-token-usage-xc)
[![license](https://img.shields.io/npm/l/dsh-token-usage-xc.svg)](https://github.com/xchannel1987/dsh-token-usage-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-token-usage-xc.svg)](https://www.npmjs.com/package/dsh-token-usage-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**DSH Token 用量统计插件** —— 实时追踪今日与最近 7 日 Token 消耗，按模型分桶展示，提供缓存命中率分析和趋势图表。

## ✨ 核心特性

### 📊 今日 Token 用量
在设置页新增「今日 Token 用量」分区，实时展示：

- **按模型统计**：输入/输出/缓存读/缓存写 Token 数
- **缓存命中率**：`cacheRead / (uncachedInput + cacheRead) × 100%`
- **请求次数**：每个模型的 API 调用次数
- **当日总计**：所有模型的汇总数据

### 📈 7 日趋势图
- **堆叠柱状图**：按模型分色的 7 日用量趋势
- **日期切换**：查看任意历史日期数据
- **模型筛选**：可选择显示特定模型

### 🔔 顶栏徽标（可选）
- **实时显示**：会话顶栏显示今日总 Token
- **点击展开**：点击徽标查看明细
- **紧凑格式**：K/M/B 简化显示，悬停查看精确值

### 💾 数据持久化
- **按天落盘**：`~/.dsh/storages/dsh-token-usage-xc/<YYYY-MM-DD>.json`
- **重启不丢**：重启后数据自动恢复
- **自动清理**：7 天自动清理旧数据
- **启动回填**：回填今天早于插件加载的用量

## 🔧 数据来源

| 来源 | 说明 |
|------|------|
| session/event | 监听 `assistant/message` 事件的 usage 字段 |
| 模型归属 | 直接读取事件的 `message.source.model` |
| 会话水位 | 按 seq 去重，避免重复计数 |

> **为什么不自己解析 session.jsonl.zstd？**  
> 该文件是多 zstd 帧拼接，需要像持久化后端那样扫描帧边界逐帧解码。插件统一走 `sessionQuery`，避免重复实现这套复杂逻辑。

## 📦 安装

```bash
# 使用 DSH CLI
dsh plugin --profile web add dsh-token-usage-xc

# 或使用 npm
npm install dsh-token-usage-xc
```

安装后重启 DSH，在设置页可看到新增的「今日 Token 用量」分区。

## ⚙️ 配置

| 选项 | 默认值 | 说明 |
|------|--------|------|
| enabled | true | 启用统计 |
| refreshIntervalSec | 60 | 前端刷新间隔（10-3600秒） |
| backfill | true | 启动时回填今日用量 |
| headerBadge | false | 会话顶栏显示总 Token 徽标 |

## 🎮 使用

### 查看今日用量
1. 打开 DSH 设置
2. 找到「今日 Token 用量」分区
3. 查看按模型分桶的明细数据

### 查看 7 日趋势
1. 在用量面板点击「趋势」标签
2. 查看堆叠柱状图
3. 点击日期查看详情

### 启用顶栏徽标
1. 在设置中打开「会话顶栏显示今日总 Token」
2. 会话页顶栏将显示今日总量
3. 点击徽标可快速查看明细

## 🔌 数据接口

提供 RPC 接口供其他插件调用：

```typescript
// POST /dsh-token-usage-xc/today
{
  available: boolean;
  date: string;           // 'YYYY-MM-DD'
  totalTokens: number;
  requests: number;
  models: {
    model: string;
    modelName: string | null;
    provider: string;
    uncachedInputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    requests: number;
  }[];
}

// POST /dsh-token-usage-xc/last7days
// 返回最近 7 日的汇总数据
```

## 📐 统计口径

- **总 Token** = uncachedInput + cacheRead + cacheWrite + output
- **缓存命中率** = cacheRead / (uncachedInput + cacheRead) × 100%
- **仅计最终 usage**：每个 assistant/message 恰好一条，天然无重复
- **按事件时间归档**：根据 event.time 归到 YYYY-MM-DD

## 📄 许可证

[MIT](LICENSE)

## 🔗 链接

- [GitHub](https://github.com/xchannel1987/dsh-token-usage-xc)
- [npm](https://www.npmjs.com/package/dsh-token-usage-xc)
- [问题反馈](https://github.com/xchannel1987/dsh-token-usage-xc/issues)
