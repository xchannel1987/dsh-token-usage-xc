// dsh-token-usage 插件入口（Host / Node 侧）
//
// 职责：
//   1. 注册设置命名空间 dsh-token-usage（enabled / refreshIntervalSec / backfill / headerBadge）。
//   2. 实时监听 session/event（dsh-token-meter 同款捕获面），折叠 assistant/message 的
//      usage 到「当天 × 模型」累计桶；按天落盘到 ~/.dsh/storages/dsh-token-usage/<日期>.json
//      （含会话水位，重启不丢、跨天自动切换）。
//   3. 启动时经 ctx.sessionQuery（持久化正规读取路径，正确处理多帧 zstd）回填今天
//      早于插件加载的用量，按会话 seq 水位去重，绝不直接解析 session.jsonl.zstd。
//   4. 注册 /dsh-token-usage RPC（端点 today）供浏览器查询当天按模型汇总 + 总计。
//
// 统计口径：total = uncachedInput + cacheRead + cacheWrite + output（与 dsh-token-meter
// 的 usageTokens 一致）；只折叠 assistant/message 的最终 usage（每步恰好一条、天然无重复）。

import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import os from "node:os";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

export const name = "dsh-token-usage";
// 顶层只声明 connection（web profile 必有）；settings / sessionQuery 在 apply 内延迟获取，
// 避免在无 settings/sessionQuery 的 host 上卡住 fiber（同 dsh-litellm-key-usage 的做法）。
export const inject = ["connection"];

const NS = "dsh-token-usage";
const RPC_CHANNEL = "/dsh-token-usage";
const RPC_ENDPOINT = "today";
/** DSH 家目录（同 dsh-home-paths：\$DSH_HOME 优先，否则 ~/.dsh）。 */
const DSH_HOME = () => {
  const env = process.env.DSH_HOME;
  return env && env.trim().length > 0 ? env.trim() : path.join(os.homedir(), ".dsh");
};
const STORE_DIR = () => path.join(DSH_HOME(), "storages", "dsh-token-usage");
const RETENTION_DAYS = 7;
const FLUSH_DEBOUNCE_MS = 2000;
const BACKFILL_CONCURRENCY = 4;
const DAY_MS = 86400000;

/** 设置命名空间 schema。 */
const SettingsSchema = z.object({
  enabled: z.boolean().default(true),
  refreshIntervalSec: z.number().min(10).max(3600).default(60),
  backfill: z.boolean().default(true),
  headerBadge: z.boolean().default(false),
});

// ---- 纯函数辅助 ----

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

/** 本地时区日期串 YYYY-MM-DD。 */
function localDateOf(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

/** 本地时区今天 00:00 的 epoch ms。 */
function startOfTodayMs(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function emptyBucket(provider) {
  return {
    provider: provider ?? "",
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    requests: 0,
  };
}

function addUsage(bucket, usage) {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  bucket.uncachedInputTokens += input;
  bucket.outputTokens += output;
  bucket.cacheReadTokens += cacheRead;
  bucket.cacheWriteTokens += cacheWrite;
  bucket.totalTokens += input + cacheRead + cacheWrite + output;
  bucket.requests += 1;
}

// ---- 跨会话「当天 × 模型」累计存储 ----

class TokenUsageStore {
  constructor(options = {}) {
    this.dir = options.dir ?? STORE_DIR();
    this.isEnabled = options.isEnabled ?? (() => true);
    this.day = null;            // 内存累计对应的本地日期 'YYYY-MM-DD'
    this.models = new Map();    // model -> bucket
    this.watermarks = new Map();// sessionId -> 已折叠的最高 seq（跨天沿用）
    this.loaded = false;
    this.backfillDone = false;
    this.sessionQueryAvailable = false;
    this.flushTimer = null;
    this.flushScheduled = false;
    this.loadPromise = null;
  }

  // ---- 目录/文件 ----

  dayFile(date) {
    return path.join(this.dir, date + ".json");
  }

  // ---- 生命周期 ----

  init() {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        await this.load();
        await this.prune();
      })();
    }
    return this.loadPromise;
  }

  /** 载入今天的落盘数据（模型桶 + 会话水位）。文件缺失/损坏时从空开始（回填会重建）。 */
  async load() {
    this.day = localDateOf(Date.now());
    try {
      await mkdir(this.dir, { recursive: true });
    } catch {
      /* 目录不可建时仅内存模式 */
    }
    try {
      const raw = await readFile(this.dayFile(this.day), "utf8");
      const doc = JSON.parse(raw);
      if (doc && doc.date === this.day && doc.models && typeof doc.models === "object") {
        for (const [model, b] of Object.entries(doc.models)) {
          if (!b || typeof b !== "object") continue;
          this.models.set(model, {
            provider: b.provider ?? "",
            uncachedInputTokens: b.uncachedInputTokens ?? 0,
            outputTokens: b.outputTokens ?? 0,
            cacheReadTokens: b.cacheReadTokens ?? 0,
            cacheWriteTokens: b.cacheWriteTokens ?? 0,
            totalTokens: b.totalTokens ?? 0,
            requests: b.requests ?? 0,
          });
        }
      }
      if (doc && doc.watermarks && typeof doc.watermarks === "object") {
        for (const [id, seq] of Object.entries(doc.watermarks)) {
          if (Number.isInteger(seq) && seq >= 0) this.watermarks.set(id, seq);
        }
      }
    } catch {
      /* 首次运行 / 损坏 -> 从空开始 */
    }
    this.loaded = true;
  }

  async writeDay(date, doc) {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.dayFile(date), JSON.stringify(doc));
    } catch {
      /* 写盘失败保留内存值，下次再试 */
    }
  }

  async flush() {
    if (this.flushScheduled) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.flushScheduled = false;
    }
    if (!this.loaded || !this.day) return;
    await this.writeDay(this.day, this.snapshot(this.day, this.models));
  }

  scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.flushTimer = setTimeout(() => {
      this.flushScheduled = false;
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
    if (this.flushTimer && typeof this.flushTimer.unref === "function") this.flushTimer.unref();
  }

  snapshot(date, models) {
    const m = {};
    for (const [model, b] of models) m[model] = { ...b };
    const w = {};
    for (const [id, seq] of this.watermarks) w[id] = seq;
    return { date, models: m, watermarks: w, generatedAt: new Date().toISOString() };
  }

  /** 跨天切换：把旧日快照写盘后，重置今日桶（水位沿用，会话跨天不丢）。 */
  rollTo(date) {
    if (date === this.day) return;
    const oldDay = this.day;
    const oldModels = this.models;
    this.writeDay(oldDay, this.snapshot(oldDay, oldModels)).catch(() => {});
    this.day = date;
    this.models = new Map();
  }

  // ---- 折叠 ----

  /**
   * 折叠一条 usage 到「当天 × 模型」桶。seq <= 水位的事件已折叠过，跳过（实时与回填
   * 两条路径共用此守卫，保证不重复计数）。
   */
  fold(sessionId, seq, time, usage, model, provider) {
    if (!this.loaded || !this.isEnabled()) return;
    const prev = this.watermarks.get(sessionId);
    if (prev !== undefined && seq <= prev) return;
    if (!model) model = "(unknown)";
    const date = localDateOf(time);
    if (date !== this.day) this.rollTo(date);
    let bucket = this.models.get(model);
    if (!bucket) {
      bucket = emptyBucket(provider);
      this.models.set(model, bucket);
    }
    addUsage(bucket, usage);
    this.watermarks.set(sessionId, seq);
    this.scheduleFlush();
  }

  // ---- 启动回填（ctx.sessionQuery 正规读取路径）----

  async backfill(sessionQuery) {
    await this.init();
    if (this.backfillDone) return;
    this.backfillDone = true;
    this.sessionQueryAvailable = true;
    if (!this.isEnabled()) return;
    const start = startOfTodayMs();
    const now = Date.now();

    let sessions = [];
    try {
      sessions = await sessionQuery.listSessions();
    } catch {
      return;
    }

    let index = 0;
    const worker = async () => {
      while (index < sessions.length) {
        const record = sessions[index++];
        const id = record && record.header ? record.header.id : undefined;
        if (!id) continue;
        try {
          const snap = await sessionQuery.readSession(id);
          for (const ev of snap.events) {
            if (ev.type !== "assistant/message") continue;
            const usage = ev.data && ev.data.usage;
            if (!usage) continue;
            if (ev.time < start || ev.time > now) continue;
            const source = ev.data.message && ev.data.message.source;
            this.fold(id, ev.seq, ev.time, usage, source ? source.model : undefined, source ? source.provider : undefined);
          }
        } catch {
          /* 单个会话读取/修复失败：跳过该会话，不阻塞其余 */
        }
      }
    };

    const workers = [];
    for (let i = 0; i < BACKFILL_CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);
    await this.flush();
  }

  // ---- 查询视图 ----

  todayView() {
    const models = [];
    for (const [model, b] of this.models) models.push({ model, ...b });
    models.sort((a, b) => b.totalTokens - a.totalTokens);
    let totalTokens = 0;
    let requests = 0;
    for (const b of this.models.values()) {
      totalTokens += b.totalTokens;
      requests += b.requests;
    }
    return {
      available: true,
      date: this.day,
      generatedAt: new Date().toISOString(),
      totalTokens,
      requests,
      backfillDone: this.backfillDone,
      sessionQueryAvailable: this.sessionQueryAvailable,
      models,
    };
  }

  /** 清理超过保留期的日文件。 */
  async prune() {
    const cutoff = localDateOf(Date.now() - RETENTION_DAYS * DAY_MS);
    let names = [];
    try {
      names = await readdir(this.dir);
    } catch {
      return;
    }
    const re = /^(\d{4}-\d{2}-\d{2})\.json$/;
    for (const n of names) {
      const m = re.exec(n);
      if (m && m[1] < cutoff) {
        try {
          await rm(path.join(this.dir, n), { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }
}

// ---- 插件主体 ----

export function apply(ctx, config = {}) {
  let current = () => config;

  // 1) 设置命名空间：用户在设置页配置，live 生效。
  installSettingsSection(ctx, settingsNamespace(NS), SettingsSchema, config, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {},
  });

  const store = new TokenUsageStore({ isEnabled: () => current().enabled });
  void store.init();

  // 2) 实时捕获：token-meter 同款 session/event 监听（宿主平面可收到主会话与子代理会话）。
  ctx.on("session/event", (session, event) => {
    if (!current().enabled) return;
    if (!event || event.type !== "assistant/message") return;
    const usage = event.data && event.data.usage;
    if (!usage) return;
    const source = event.data.message && event.data.message.source;
    store.fold(session.id, event.seq, event.time, usage, source ? source.model : undefined, source ? source.provider : undefined);
  });

  // 3) 启动回填：sessionQuery 可用才执行（缺失时静默降级为纯实时）。
  ctx.inject(["sessionQuery"], (sqCtx) => {
    void store.backfill(sqCtx.sessionQuery);
  });

  // 4) RPC：浏览器 -> host。
  ctx.inject(["connection"], (connectionCtx) => {
    connectionCtx.connection.rpc.handle(
      RPC_CHANNEL,
      async (endpoint) => {
        if (endpoint !== RPC_ENDPOINT) {
          return {
            ok: true,
            value: {
              available: false,
              error: { kind: "bad-request", message: "未知端点：" + String(endpoint) },
            },
          };
        }
        if (!current().enabled) {
          return {
            ok: true,
            value: {
              available: true,
              disabled: true,
              date: store.day,
              generatedAt: new Date().toISOString(),
              totalTokens: 0,
              requests: 0,
              models: [],
            },
          };
        }
        return { ok: true, value: store.todayView() };
      },
      { authority: "trusted-host" }
    );
  });

  // 5) 卸载时尽力刷盘。
  ctx.effect(() => () => {
    void store.flush();
  });
}
