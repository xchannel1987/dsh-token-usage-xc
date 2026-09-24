// dsh-token-usage-xc 插件入口（Host / Node 侧）
//
// 职责：
//   1. 注册设置命名空间 dsh-token-usage-xc（enabled / refreshIntervalSec / backfill / headerBadge）。
//   2. 实时监听 session/event（dsh-token-meter 同款捕获面），折叠 assistant/message 的
//      usage 到「当天 × 模型」累计桶；按天落盘到 ~/.dsh/storages/dsh-token-usage-xc/<日期>.json
//      （含会话水位，重启不丢、跨天自动切换）。
//   3. 启动时经 ctx.sessionQuery（持久化正规读取路径，正确处理多帧 zstd）回填今天
//      早于插件加载的用量，按会话 seq 水位去重，绝不直接解析 session.jsonl.zstd。
//   4. 经 connection.fetch.register 注册 /api/dsh-token-usage-xc/{today,last7days} 精确
//      Fetch 路由供浏览器查询（dsh ≥0.1.5 起 rpc.handle 通道静默失效，见 CHANGELOG 0.2.24；
//      旧 rpc.handle 通道保留 try/catch 兜底，兼容旧客户端与带 profile 补丁的宿主）。
//
// 统计口径：total = uncachedInput + cacheRead + cacheWrite + output（与 dsh-token-meter
// 的 usageTokens 一致）；只折叠 assistant/message 的最终 usage（每步恰好一条、天然无重复）。

import z from "@deepseek-ai/schemastery";
import os from "node:os";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

export const name = "dsh-token-usage-xc";
// 顶层只声明 connection（web profile 必有）；settings / sessionQuery 在 apply 内延迟获取，
// 避免在无 settings/sessionQuery 的 host 上卡住 fiber（同 dsh-litellm-key-usage 的做法）。
export const inject = ["connection"];

const NS = "dsh-token-usage-xc";
const RPC_CHANNEL = "/dsh-token-usage-xc";
const RPC_ENDPOINT = "today";
const RPC_LAST7_ENDPOINT = "last7days";
/** 精确 Fetch 路由前缀（挂在共享 /api 通道下，见 apply 第 5 节）。 */
const RPC_API_PREFIX = "/api/" + NS;
/** DSH 家目录（同 dsh-home-paths：\$DSH_HOME 优先，否则 ~/.dsh）。 */
const DSH_HOME = () => {
  const env = process.env.DSH_HOME;
  return env && env.trim().length > 0 ? env.trim() : path.join(os.homedir(), ".dsh");
};
const STORE_DIR = () => path.join(DSH_HOME(), "storages", "dsh-token-usage-xc");
const RETENTION_DAYS = 7;
const FLUSH_DEBOUNCE_MS = 2000;
const BACKFILL_CONCURRENCY = 4;
const NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 86400000;

/**
 * 设置命名空间 schema。
 * 字段标记 volatile（等价于 schemastery >= 3.18.4 的 `.volatile()`，用 `.extra()` 写法
 * 以便同时兼容 profile 内提升的 3.18.1）：DSH >= 0.1.7 的设置服务只把「含 volatile 字段」
 * 的 Config 投影为可配置命名空间，未标记则整个命名空间不出现在 describe() 里。
 */
const SettingsSchema = z.object({
  enabled: z.boolean().default(true).extra("volatile", true),
  refreshIntervalSec: z.number().min(10).max(3600).default(60).extra("volatile", true),
  backfill: z.boolean().default(true).extra("volatile", true),
  headerBadge: z.boolean().default(false).extra("volatile", true),
});

/**
 * 插件 Config：DSH >= 0.1.7 由宿主插件「导出的 Config」声明设置命名空间
 * （命名空间 id = profile 条目 id = NS），旧版 ctx.settings.register 接口已移除。
 */
export const Config = SettingsSchema;

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
    this.llm = null;            // 可选注入的 llm 服务（解析模型显示名）
    this.nameCache = null;     // { builtAt, map<modelId, displayName> }
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

  /** 注入 llm 服务（可选），用于解析模型显示名；并清空名称缓存。 */
  setLlm(service) {
    this.llm = service;
    this.nameCache = null;
  }

  modelKey(model, provider) {
    return String(provider ?? "") + "\u0000" + String(model ?? "");
  }

  /** 解析给定模型桶的显示名；失败时保留原始模型 id。 */
  async resolveNamesForBuckets(buckets) {
    if (!this.llm) return new Map();
    const now = Date.now();
    const cache = this.nameCache && now - this.nameCache.builtAt < NAME_CACHE_TTL_MS
      ? this.nameCache.map : new Map();
    const providers = new Set();
    for (const [model, b] of buckets) {
      const key = this.modelKey(model, b.provider);
      if (b.provider && !cache.has(key)) providers.add(b.provider);
    }
    for (const provider of providers) {
      try {
        const infos = await this.llm.listModels(provider);
        for (const info of infos || []) {
          if (info && info.id && typeof info.name === "string" && info.name.length > 0) {
            cache.set(this.modelKey(info.id, provider), info.name);
          }
        }
      } catch {
        for (const [model, b] of buckets) {
          if (b.provider !== provider || cache.has(this.modelKey(model, provider))) continue;
          try {
            const info = await this.llm.resolveModelInfo(provider, model, AbortSignal.timeout(3000));
            if (info && typeof info.name === "string" && info.name.length > 0) {
              cache.set(this.modelKey(model, provider), info.name);
            }
          } catch {
            /* 解析失败：保持原样 */
          }
        }
      }
    }
    this.nameCache = { builtAt: now, map: cache };
    return cache;
  }

  async rowsFromBuckets(buckets) {
    const rows = [];
    for (const [model, b] of buckets) rows.push({ model, ...b });
    rows.sort((a, b) => b.totalTokens - a.totalTokens);
    const names = await this.resolveNamesForBuckets(buckets);
    for (const row of rows) {
      const name = names.get(this.modelKey(row.model, row.provider));
      row.modelName = name && name !== row.model ? name : null;
    }
    return rows;
  }

  totalsForBuckets(buckets) {
    let totalTokens = 0;
    let requests = 0;
    for (const b of buckets.values()) {
      totalTokens += b.totalTokens || 0;
      requests += b.requests || 0;
    }
    return { totalTokens, requests };
  }

  async todayView() {
    const totals = this.totalsForBuckets(this.models);
    return {
      available: true,
      date: this.day,
      generatedAt: new Date().toISOString(),
      ...totals,
      backfillDone: this.backfillDone,
      sessionQueryAvailable: this.sessionQueryAvailable,
      models: await this.rowsFromBuckets(this.models),
    };
  }

  async readStoredDay(date) {
    const buckets = new Map();
    try {
      const doc = JSON.parse(await readFile(this.dayFile(date), "utf8"));
      if (doc && doc.date === date && doc.models && typeof doc.models === "object") {
        for (const [model, b] of Object.entries(doc.models)) {
          if (!b || typeof b !== "object") continue;
          buckets.set(model, {
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
    } catch {
      /* 缺失/损坏日文件按空日处理 */
    }
    return buckets;
  }

  recentDates(count = 7) {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const dates = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(base.getTime() - i * DAY_MS);
      dates.push(localDateOf(d.getTime()));
    }
    return dates;
  }

  async last7DaysView() {
    const days = [];
    for (const date of this.recentDates(7)) {
      const buckets = date === this.day ? this.models : await this.readStoredDay(date);
      const totals = this.totalsForBuckets(buckets);
      days.push({ date, ...totals, models: await this.rowsFromBuckets(buckets) });
    }
    return { available: true, generatedAt: new Date().toISOString(), days };
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

/**
 * 解包 volatile 字段引用：schemastery >= 3.18.4 把 volatile 值包成不可变引用
 * （官方插件写 `this.config.x.get()`），3.18.1 则是普通值。两种都归一化为普通值。
 */
function readField(value) {
  return value !== null && typeof value === "object" && typeof value.get === "function" ? value.get() : value;
}

/** 归一化整份配置为普通值对象（逐字段解包 volatile 引用）。 */
function readConfig(config) {
  const out = {};
  for (const key of Object.keys(config ?? {})) out[key] = readField(config[key]);
  return out;
}

export function apply(ctx, config = {}) {
  // 1) 设置来源（DSH >= 0.1.7）：命名空间由导出的 Config 声明，值经本函数的 config 参数
  //    注入——用户改设置后宿主会重载本插件，所以每次 apply 拿到的都是最新值，无需 watch。
  //    （旧版 ctx.settings.register 在 0.1.7 已移除，这里不再调用。）
  let current = () => readConfig(config);

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

  // 3) 模型显示名解析（可选：llm 服务缺失时回退原始模型 id）。
  ctx.inject(["llm"], (llmCtx) => {
    store.setLlm(llmCtx.llm);
  });

  // 4) 启动回填：sessionQuery 可用才执行（缺失时静默降级为纯实时）。
  ctx.inject(["sessionQuery"], (sqCtx) => {
    void store.backfill(sqCtx.sessionQuery);
  });

  // 5) RPC：浏览器 -> host。
  //    dsh ≥0.1.5 起 rpc.handle 静默失效：dsh-client-connection 包级 inject 从
  //    ["webServer","credentials"] 缩为 ["credentials"]，而 register() 内部经 caller-fiber
  //    shadow 回到 connection 提供者 fiber 解析 owner.webServer，未声明即抛
  //    "cannot get property webServer without inject"，且异常被本 ctx.inject 子 fiber
  //    吞掉（主 fiber 仍 active、零日志），HTTP 通道从未注册、POST 落到 SPA 兜底变 405。
  //    改用 connection.fetch.register()：其 effect 体只写连接服务内部 Map、不触碰
  //    webServer，任何第三方 fiber 均可注册（离线复现实测）；该 API 自 0.1.2-alpha.3 起
  //    存在且形态一致，覆盖 engines 声明的全部兼容范围。认证不降级：/api 前缀路由自带
  //    Host/Origin fence + token/cookie 门禁。旧 rpc.handle 通道保留 try/catch 兜底
  //    （同 dsh-session-xc 0.9.0 做法）。
  const handleRpc = async (endpoint) => {
    if (endpoint !== RPC_ENDPOINT && endpoint !== RPC_LAST7_ENDPOINT) {
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
        value: endpoint === RPC_LAST7_ENDPOINT
          ? { available: true, disabled: true, days: [] }
          : {
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
    return {
      ok: true,
      value: endpoint === RPC_LAST7_ENDPOINT ? await store.last7DaysView() : await store.todayView(),
    };
  };

  ctx.inject(["connection"], (connectionCtx) => {
    for (const endpoint of [RPC_ENDPOINT, RPC_LAST7_ENDPOINT]) {
      try {
        connectionCtx.connection.fetch.register({
          path: RPC_API_PREFIX + "/" + endpoint,
          methods: ["POST"],
          requestBody: "buffered",
          fetch: async (request) => {
            let rpcId = "invalid-request";
            try {
              const body = await request.json().catch(() => null);
              if (!body || body.type !== "client-request" || typeof body.rpcId !== "string" || typeof body.method !== "string") {
                return Response.json({
                  type: "server-response",
                  rpcId,
                  result: { ok: false, error: { code: "gateway/bad-request", message: "invalid client-request message", details: {} } },
                });
              }
              rpcId = body.rpcId;
              if (body.method !== NS + "/" + endpoint) {
                return Response.json({
                  type: "server-response",
                  rpcId,
                  result: { ok: false, error: { code: "gateway/bad-request", message: "method does not match route: " + String(body.method), details: {} } },
                });
              }
              return Response.json({ type: "server-response", rpcId, result: await handleRpc(endpoint) });
            } catch (error) {
              return Response.json({
                type: "server-response",
                rpcId,
                result: { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error), details: {} } },
              });
            }
          },
        });
      } catch (error) {
        console.error(`[dsh-token-usage-xc] Fetch 路由注册失败（${endpoint}）：`, error);
      }
    }
    try {
      connectionCtx.connection.rpc.handle(RPC_CHANNEL, (endpoint) => handleRpc(endpoint), { authority: "trusted-host" });
    } catch {
      // 预期内：dsh ≥0.1.5 且宿主未带 profile 补丁时 rpc.handle 必抛（见上方注释），忽略。
    }
  });

  // 6) 卸载时尽力刷盘。
  ctx.effect(() => () => {
    void store.flush();
  });
}