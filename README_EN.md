# dsh-token-usage-xc

[![npm version](https://img.shields.io/npm/v/dsh-token-usage-xc.svg)](https://www.npmjs.com/package/dsh-token-usage-xc)
[![license](https://img.shields.io/npm/l/dsh-token-usage-xc.svg)](https://github.com/xchannel1987/dsh-token-usage-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-token-usage-xc.svg)](https://www.npmjs.com/package/dsh-token-usage-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**DSH Token Usage Statistics Plugin** — Real-time tracking of today's and last 7 days' token consumption, bucketed by model with cache hit rate analysis and trend charts.

## ✨ Core Features

### 📊 Today's Token Usage
New "Today's Token Usage" section in settings page showing:

- **Per-Model Statistics**: Input/Output/Cache Read/Cache Write tokens
- **Cache Hit Rate**: `cacheRead / (uncachedInput + cacheRead) × 100%`
- **Request Count**: API calls per model
- **Daily Total**: Aggregated data across all models

### 📈 7-Day Trend Chart
- **Stacked Bar Chart**: 7-day usage trend with model-colored segments
- **Date Navigation**: View any historical date
- **Model Filter**: Select specific models to display

### 🔔 Header Badge (Optional)
- **Real-time Display**: Shows today's total tokens in conversation header
- **Click to Expand**: Click badge for detailed breakdown
- **Compact Format**: K/M/B notation with hover for exact values
- **Mobile Layout** (≤1023px): the header row reads  Hamburg │ PTC mode │ Remaining meter │ Usage badge │ Background jobs — the badge sits second-to-last with jobs rightmost, aligned on the same row as the drawer toggle without overlap; ≤380px wraps automatically while preserving visual order
- **Mobile Compactness**: the "tok" suffix is hidden and padding tightened so a 390px-wide single row fits completely

### 💾 Data Persistence
- **Daily Storage**: `~/.dsh/storages/dsh-token-usage-xc/<YYYY-MM-DD>.json`
- **Restart Resilient**: Data auto-recovers after restart
- **Auto Cleanup**: 7-day automatic cleanup of old data
- **Startup Backfill**: Backfills usage before plugin loaded today

## 🔧 Data Sources

| Source | Description |
|--------|-------------|
| session/event | Listen to `assistant/message` event's usage field |
| Model Attribution | Read event's `message.source.model` directly |
| Session Watermark | Dedupe by seq to avoid double counting |

> **Why not parse session.jsonl.zstd directly?**  
> The file is multi-zstd-frame concatenated, requiring frame boundary scanning like the persistence backend. Plugins use `sessionQuery` to avoid reimplementing this complex logic.

## 📦 Installation

```bash
# Using DSH CLI
dsh plugin --profile web add dsh-token-usage-xc

# Or using npm
npm install dsh-token-usage-xc
```

Restart DSH after installation. You'll see a new "Today's Token Usage" section in settings.

## ⚙️ Configuration

| Option | Default | Description |
|--------|---------|-------------|
| enabled | true | Enable statistics |
| refreshIntervalSec | 60 | Frontend refresh interval (10-3600s) |
| backfill | true | Backfill today's usage on startup |
| headerBadge | false | Show total token badge in conversation header |

## 🎮 Usage

### View Today's Usage
1. Open DSH Settings
2. Find "Today's Token Usage" section
3. View per-model breakdown

### View 7-Day Trend
1. Click "Trend" tab in usage panel
2. View stacked bar chart
3. Click dates for details

### Enable Header Badge
1. Enable "Show today's total tokens in conversation header" in settings
2. Today's total appears in conversation header
3. Click badge for quick details

## 🔌 Data Interface

RPC endpoints for other plugins:

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
// Returns last 7 days' aggregated data
```

## 📐 Statistics Methodology

- **Total Tokens** = uncachedInput + cacheRead + cacheWrite + output
- **Cache Hit Rate** = cacheRead / (uncachedInput + cacheRead) × 100%
- **Final Usage Only**: Each assistant/message has exactly one usage, naturally deduped
- **Event Time Bucketing**: Bucketed to YYYY-MM-DD based on event.time

## 📄 License

[MIT](LICENSE)

## 🔗 Links

- [GitHub](https://github.com/xchannel1987/dsh-token-usage-xc)
- [npm](https://www.npmjs.com/package/dsh-token-usage-xc)
- [Issues](https://github.com/xchannel1987/dsh-token-usage-xc/issues)
