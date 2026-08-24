// dsh-token-usage 浏览器端 bundle（手写，无构建步骤）
//
// 与 DSH 内置客户端插件同构：window.__ModuleLoader__.load({ id, factory })。
// 只 require() 平台静态模块（react / primitives / runtime/client），
// 其余协作全部走 cordis 服务注入（connection / slots / locale / settingsScope）。
//
// 展示：
//   1. 设置页新增分区「今日 Token 用量」（settings.section）：日期 + 总计 + 按模型表格
//      （模型/输入/输出/缓存读/缓存写/合计/次数）+ 总计行 + 手动刷新 + 配置表单。
//   2. 会话顶栏常驻小徽标（conversation.session.header.actions，默认关闭）：今日总 token，
//      点击展开快速查看表格。

window.__ModuleLoader__.load({
	id: "dsh-token-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");
		let reactDom = require("react-dom");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let runtime = require("@deepseek-ai/dsh-client-runtime/client");

		// ---- 样式（作用域类名 dshu-*；使用 DSH 主题变量并带兜底）----
		const CSS = [
			".dshu-root{box-sizing:border-box;width:100%;max-width:760px;flex-direction:column;gap:10px;display:flex}",
			".dshu-card{box-sizing:border-box;position:relative;overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-layer-2,#F5F7FA) 88%,transparent),color-mix(in srgb,var(--dsw-alias-bg-layer-2,#F5F7FA) 68%,transparent));border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 60%,transparent);border-radius:14px;padding:13px 15px;box-shadow:0 1px 2px rgba(16,40,56,.05),0 10px 26px rgba(16,40,56,.08)}",
			".dshu-head{align-items:center;gap:8px;min-width:0;display:flex}",
			".dshu-title{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:13px;font-weight:700;line-height:1.4;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}",
			".dshu-subtitle{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px;white-space:nowrap}",
			".dshu-spacer{flex:1;min-width:8px}",
			".dshu-btn{appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary,#5A6B82);background:color-mix(in srgb,var(--dsw-alias-bg-base,#FFFFFF) 50%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 55%,transparent);border-radius:8px;padding:3px 11px;font-size:12px;line-height:18px;display:inline-flex;align-items:center;gap:4px;transition:background .15s ease,border-color .15s ease}",
			".dshu-btn:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#EEF2F6) 80%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 80%,transparent)}",
			".dshu-btn:disabled{opacity:.5;cursor:default}",
			".dshu-totalRow{display:flex;align-items:baseline;gap:10px;margin-top:4px;min-width:0}",
			".dshu-totalLabel{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:12px;line-height:18px}",
			".dshu-totalValue{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:22px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}",
			".dshu-totalMeta{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px}",
			".dshu-table{width:100%;border-collapse:collapse;margin-top:8px}",
			".dshu-th{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px;font-weight:600;text-align:right;padding:4px 6px;white-space:nowrap}",
			".dshu-thL,.dshu-tdL{text-align:left}",
			".dshu-td{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:12px;line-height:18px;text-align:right;padding:4px 6px;font-variant-numeric:tabular-nums;white-space:nowrap}",
			".dshu-modelCell{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#2E3A4D)}",
			".dshu-provider{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dshu-tdTotal{font-weight:650;color:var(--dsw-alias-label-primary,#2E3A4D)}",
			".dshu-trTotal .dshu-td{border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 45%,transparent);font-weight:700;color:var(--dsw-alias-label-primary,#2E3A4D)}",
			".dshu-empty{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:12px;line-height:18px;padding:2px 0;display:flex}",
			".dshu-banner{box-sizing:border-box;width:100%;border-radius:8px;padding:5px 10px;font-size:12px;line-height:18px;display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary,#2E3A4D)}",
			".dshu-bannerErr{background:rgba(229,57,53,.11);color:#BF3325}",
			".dshu-bannerWarn{background:rgba(240,160,32,.13);color:#B97600}",
			".dshu-form{flex-direction:column;gap:10px;margin-top:10px;padding:12px 14px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#F5F7FA) 46%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 50%,transparent);border-radius:12px;display:flex}",
			".dshu-field{flex-direction:column;gap:4px;display:flex;min-width:0}",
			".dshu-fieldRow{flex-direction:row;align-items:center;gap:8px;display:flex;min-width:0}",
			".dshu-fieldHead{align-items:center;gap:8px;min-width:0;display:flex}",
			".dshu-label{color:var(--dsw-alias-label-secondary,#5A6B82);font-size:12px;line-height:18px}",
			".dshu-input{box-sizing:border-box;width:100%;font:inherit;color:var(--dsw-alias-label-primary,#2E3A4D);background:color-mix(in srgb,var(--dsw-alias-bg-base,#FFFFFF) 70%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 60%,transparent);border-radius:8px;padding:5px 9px;font-size:12px;line-height:18px;transition:border-color .15s ease,box-shadow .15s ease}",
			".dshu-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary,#2FBE77);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#2FBE77) 18%,transparent)}",
			".dshu-check{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#2FBE77);cursor:pointer;flex:none}",
			".dshu-hint{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px}",
			".dshu-formFooter{align-items:center;justify-content:flex-end;gap:8px;margin-top:2px;display:flex}",
			".dshu-saveBtn{appearance:none;font:inherit;cursor:pointer;color:#fff;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-brand-primary,#2FBE77) 88%,#FFFFFF),var(--dsw-alias-brand-primary,#2FBE77));border:0;border-radius:8px;padding:5px 15px;font-size:12px;font-weight:650;line-height:18px;box-shadow:0 2px 8px color-mix(in srgb,var(--dsw-alias-brand-primary,#2FBE77) 32%,transparent);transition:filter .15s ease,box-shadow .15s ease}",
			".dshu-saveBtn:hover{filter:brightness(1.05)}",
			".dshu-saveBtn:disabled{opacity:.6;cursor:default}",
			".dshu-meta{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}",
			".dshu-pillRoot{position:relative;display:inline-flex}",
			".dshu-pill{min-height:26px;cursor:pointer;color:var(--dsw-alias-label-secondary,#5A6B82);background:var(--dsw-alias-bg-layer-2,#F5F7FA);border:1px solid var(--dsw-alias-border-l2,#335A6B82);border-radius:999px;align-items:center;gap:5px;padding:2px 8px;font-size:11px;line-height:18px;display:inline-flex;font-variant-numeric:tabular-nums}",
			".dshu-pillText{white-space:nowrap}",
			".dshu-pop{position:fixed;z-index:1200;box-sizing:border-box;background:var(--dsw-alias-bg-layer-2,#F5F7FA);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 70%,transparent);border-radius:12px;box-shadow:0 12px 32px rgba(16,40,56,.18);padding:12px 14px;max-height:70vh;overflow:auto}"
		].join("");

		if (typeof document !== "undefined" && typeof document.head !== "undefined") {
			const style = document.createElement("style");
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		const cx = {
			root: "dshu-root", card: "dshu-card", head: "dshu-head", title: "dshu-title",
			subtitle: "dshu-subtitle", spacer: "dshu-spacer", btn: "dshu-btn",
			totalRow: "dshu-totalRow", totalLabel: "dshu-totalLabel", totalValue: "dshu-totalValue", totalMeta: "dshu-totalMeta",
			table: "dshu-table", th: "dshu-th", thL: "dshu-thL", td: "dshu-td", tdL: "dshu-tdL",
			modelCell: "dshu-modelCell", provider: "dshu-provider", tdTotal: "dshu-tdTotal", trTotal: "dshu-trTotal",
			empty: "dshu-empty", banner: "dshu-banner", bannerErr: "dshu-bannerErr", bannerWarn: "dshu-bannerWarn",
			form: "dshu-form", field: "dshu-field", fieldRow: "dshu-fieldRow", fieldHead: "dshu-fieldHead", label: "dshu-label",
			input: "dshu-input", check: "dshu-check", hint: "dshu-hint", formFooter: "dshu-formFooter",
			saveBtn: "dshu-saveBtn", meta: "dshu-meta",
			pillRoot: "dshu-pillRoot", pill: "dshu-pill", pillText: "dshu-pillText", pop: "dshu-pop"
		};

		const h = react.createElement;
		const { useState, useEffect, useRef, useCallback } = react;
		const NS = "dsh-token-usage";

		// ---- 纯函数 ----
		function exactTokens(n) {
			if (typeof n !== "number" || !Number.isFinite(n)) return "—";
			return n.toLocaleString("en-US");
		}
		function compactTokens(n) {
			if (typeof n !== "number" || !Number.isFinite(n)) return "—";
			if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k";
			return String(n);
		}
		function two(n) {
			return n < 10 ? "0" + n : String(n);
		}
		function clockLabel(ts) {
			if (!ts) return "—";
			const d = new Date(ts);
			return two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
		}
		function dateLabel(date) {
			if (!date) return "";
			return date;
		}

		// ---- 轮询控制器 ----
		function createController(rpc, scope) {
			const store = runtime.createSnapshotStore({
				phase: "loading", // loading | ready
				result: null, // today RPC 返回值
				lastRefreshAt: null,
				refreshing: false
			});
			const scopeStore = runtime.createSnapshotStore({
				status: "loading",
				value: undefined,
				base: undefined,
				user: undefined,
				revision: undefined,
				writable: false,
				mode: "host"
			});
			const syncScope = () => {
				const snap = scope.getSnapshot();
				scopeStore.update((d) => {
					d.status = snap.status;
					d.value = snap.value;
					d.base = snap.base;
					d.user = snap.user;
					d.revision = snap.revision;
					d.writable = snap.writable;
					d.mode = snap.mode;
				});
			};
			const offScope = scope.subscribe(() => syncScope());
			syncScope();

			let inFlight = false;
			let timer = null;

			async function refresh() {
				if (inFlight) return;
				inFlight = true;
				store.update((d) => { d.refreshing = true; });
				try {
					const out = await rpc.call("/dsh-token-usage", "today", {});
					const value = out && out.ok ? out.value : null;
					store.update((d) => {
						d.phase = "ready";
						d.result = value;
						d.lastRefreshAt = Date.now();
						d.refreshing = false;
					});
				} catch (error) {
					store.update((d) => {
						d.phase = "ready";
						d.result = {
							available: false,
							error: { kind: "internal", message: error instanceof Error ? error.message : String(error) }
						};
						d.lastRefreshAt = Date.now();
						d.refreshing = false;
					});
				} finally {
					inFlight = false;
				}
			}

			function intervalSec() {
				const snap = scope.getSnapshot();
				const sec = snap && snap.value && typeof snap.value.refreshIntervalSec === "number" ? snap.value.refreshIntervalSec : 60;
				return Math.max(10, Math.min(3600, Math.round(sec)));
			}
			function schedule() {
				if (timer) clearInterval(timer);
				timer = setInterval(() => { void refresh(); }, intervalSec() * 1000);
			}
			function start() {
				void refresh();
				schedule();
			}
			function stop() {
				if (timer) {
					clearInterval(timer);
					timer = null;
				}
				offScope();
			}

			return { store, scopeStore, refresh, start, stop, schedule };
		}

		// ---- 今日用量表格 ----
		function UsageTable({ result, t }) {
			const models = Array.isArray(result.models) ? result.models : [];
			if (models.length === 0) {
				return h("div", { className: cx.empty }, t("noUsage"));
			}
			const ths = ["model", "input", "output", "cacheRead", "cacheWrite", "total", "requests"];
			const labels = {
				model: t("thModel"), input: t("thInput"), output: t("thOutput"),
				cacheRead: t("thCacheRead"), cacheWrite: t("thCacheWrite"), total: t("thTotal"), requests: t("thRequests")
			};
			const total = models.reduce((acc, m) => ({
				uncachedInputTokens: acc.uncachedInputTokens + (m.uncachedInputTokens || 0),
				outputTokens: acc.outputTokens + (m.outputTokens || 0),
				cacheReadTokens: acc.cacheReadTokens + (m.cacheReadTokens || 0),
				cacheWriteTokens: acc.cacheWriteTokens + (m.cacheWriteTokens || 0),
				totalTokens: acc.totalTokens + (m.totalTokens || 0),
				requests: acc.requests + (m.requests || 0)
			}), { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, requests: 0 });

			return h("table", { className: cx.table }, [
				h("thead", { key: "head" }, h("tr", { key: "r" }, ths.map((k) =>
					h("th", { key: k, className: cx.th + (k === "model" ? " " + cx.thL : "") }, labels[k])))),
				h("tbody", { key: "body" }, [
					models.map((m, i) => {
						const label = m.modelName && m.modelName !== m.model ? m.modelName : m.model;
						const sub = [];
						if (m.modelName && m.modelName !== m.model) sub.push(m.model);
						if (m.provider) sub.push(m.provider);
						return h("tr", { key: "m" + i }, [
						h("td", { key: "model", className: cx.td + " " + cx.tdL + " " + cx.modelCell, title: sub.join(" · ") }, [
							label,
							sub.length ? h("span", { className: cx.provider }, sub.join(" · ")) : null
						]),
						h("td", { key: "input", className: cx.td }, exactTokens(m.uncachedInputTokens)),
						h("td", { key: "output", className: cx.td }, exactTokens(m.outputTokens)),
						h("td", { key: "cacheRead", className: cx.td }, exactTokens(m.cacheReadTokens)),
						h("td", { key: "cacheWrite", className: cx.td }, exactTokens(m.cacheWriteTokens)),
						h("td", { key: "total", className: cx.td + " " + cx.tdTotal }, exactTokens(m.totalTokens)),
						h("td", { key: "requests", className: cx.td }, exactTokens(m.requests))
					]);
						}),
					h("tr", { key: "total", className: cx.trTotal }, [
						h("td", { key: "model", className: cx.td + " " + cx.tdL }, t("total")),
						h("td", { key: "input", className: cx.td }, exactTokens(total.uncachedInputTokens)),
						h("td", { key: "output", className: cx.td }, exactTokens(total.outputTokens)),
						h("td", { key: "cacheRead", className: cx.td }, exactTokens(total.cacheReadTokens)),
						h("td", { key: "cacheWrite", className: cx.td }, exactTokens(total.cacheWriteTokens)),
						h("td", { key: "total", className: cx.td }, exactTokens(total.totalTokens)),
						h("td", { key: "requests", className: cx.td }, exactTokens(total.requests))
					])
				])
			]);
		}

		// ---- 配置表单 ----
		function ConfigForm({ t, scope, config, writable, refresh, keyConfigured }) {
			const [drafts, setDrafts] = useState({});
			const [saving, setSaving] = useState(false);
			const [saveMsg, setSaveMsg] = useState(null);
			const scopeValue = (config && config.value) || {};
			const boolVal = (key, fallback) => {
				if (drafts[key] !== undefined) return drafts[key];
				const v = scopeValue[key];
				return typeof v === "boolean" ? v : fallback;
			};
			const onSave = useCallback(async () => {
				if (!writable || saving) return;
				setSaving(true);
				setSaveMsg(null);
				const writes = [];
				if (drafts.enabled !== undefined) writes.push(scope.set("enabled", !!drafts.enabled));
				if (drafts.headerBadge !== undefined) writes.push(scope.set("headerBadge", !!drafts.headerBadge));
				if (drafts.backfill !== undefined) writes.push(scope.set("backfill", !!drafts.backfill));
				if (drafts.refreshIntervalSec !== undefined) {
					const n = Number(drafts.refreshIntervalSec.trim());
					if (Number.isFinite(n)) writes.push(scope.set("refreshIntervalSec", Math.max(10, Math.min(3600, Math.round(n)))));
				}
				try {
					await Promise.all(writes);
					setDrafts({});
					setSaveMsg(t("saved"));
					if (refresh) void refresh();
				} catch {
					setSaveMsg(t("saveFailed"));
				} finally {
					setSaving(false);
				}
			}, [drafts, writable, saving, refresh, scope, t]);

			if (!scope) return null;
			return h("div", { className: cx.form }, [
				h("div", { className: cx.field }, [
					h("div", { className: cx.fieldRow }, [
						h("input", { type: "checkbox", className: cx.check, checked: boolVal("enabled", true),
							onChange: (e) => setDrafts((d) => ({ ...d, enabled: e.target.checked })) }),
						h("span", { className: cx.label }, t("enabled"))
					]),
					h("span", { className: cx.hint }, t("enabledHint"))
				]),
				h("div", { className: cx.field }, [
					h("div", { className: cx.fieldRow }, [
						h("input", { type: "checkbox", className: cx.check, checked: boolVal("headerBadge", false),
							onChange: (e) => setDrafts((d) => ({ ...d, headerBadge: e.target.checked })) }),
						h("span", { className: cx.label }, t("headerBadge"))
					]),
					h("span", { className: cx.hint }, t("headerBadgeHint"))
				]),
				h("div", { className: cx.field }, [
					h("div", { className: cx.fieldRow }, [
						h("input", { type: "checkbox", className: cx.check, checked: boolVal("backfill", true),
							onChange: (e) => setDrafts((d) => ({ ...d, backfill: e.target.checked })) }),
						h("span", { className: cx.label }, t("backfill"))
					]),
					h("span", { className: cx.hint }, t("backfillHint"))
				]),
				h("div", { className: cx.field }, [
					h("div", { className: cx.fieldHead }, [h("span", { className: cx.label }, t("refreshInterval"))]),
					h("input", {
						className: cx.input, type: "number", min: "10", max: "3600",
						value: drafts.refreshIntervalSec !== undefined ? drafts.refreshIntervalSec : String(scopeValue.refreshIntervalSec !== undefined ? scopeValue.refreshIntervalSec : 60),
						onChange: (e) => setDrafts((d) => ({ ...d, refreshIntervalSec: e.target.value }))
					}),
					h("span", { className: cx.hint }, t("refreshIntervalHint"))
				]),
				h("div", { className: cx.formFooter }, [
					saveMsg ? h("span", { className: cx.meta }, saveMsg) : null,
					h("button", { type: "button", className: cx.saveBtn, disabled: saving || !writable,
						onClick: () => { void onSave(); } }, saving ? t("saving") : t("save"))
				])
			]);
		}

		// ---- 设置页分区 ----
		function UsageSection({ t, useTokenUsage, useTokenUsageConfig, refresh, scope }) {
			const usage = useTokenUsage((s) => s);
			const config = useTokenUsageConfig((s) => s);
			const [showForm, setShowForm] = useState(false);

			const scopeValue = (config && config.value) || {};
			const writableVal = config ? config.writable : false;
			const result = usage.result;
			const refreshing = !!usage.refreshing;

			let body;
			if (!result || result.available === false) {
				body = h("div", { className: cx.empty }, result && result.error ? result.error.message : t("unavailable"));
			} else if (result.disabled) {
				body = h("div", { className: cx.empty }, t("disabled"));
			} else if (usage.phase === "loading" && !result) {
				body = h("div", { className: cx.empty }, t("loading"));
			} else {
				body = [
					h("div", { className: cx.totalRow, key: "total" }, [
						h("span", { className: cx.totalLabel }, t("todayTotal") + " · " + dateLabel(result.date)),
						h("span", { className: cx.spacer }),
						h("span", { className: cx.totalMeta }, t("requests") + " " + exactTokens(result.requests || 0))
					]),
					h("div", { className: cx.totalRow, key: "value" }, [
						h("span", { className: cx.totalValue }, exactTokens(result.totalTokens || 0)),
						h("span", { className: cx.totalMeta }, t("tokens")),
						h("span", { className: cx.spacer }),
						h("span", { className: cx.meta }, result.backfillDone ? t("backfillDone") : t("backfillPending"))
					]),
					h(UsageTable, { result, t, key: "table" }),
					!result.sessionQueryAvailable ? h("div", { className: cx.banner + " " + cx.bannerWarn, key: "noquery" }, [
						h("span", { key: "i" }, "⚠"), h("span", { key: "m" }, t("noQueryWarn"))
					]) : null
				];
			}

			return h("div", { className: cx.root }, [
				h("div", { className: cx.card, key: "card" }, [
					h("div", { className: cx.head }, [
						h("span", { className: cx.title }, t("title")),
						h("span", { className: cx.spacer }),
						refresh ? h("button", { type: "button", className: cx.btn, disabled: refreshing,
							onClick: () => { void refresh(); } }, t("refresh")) : null,
						writableVal && scope ? h("button", { type: "button", className: cx.btn,
							onClick: () => setShowForm((v) => !v) }, showForm ? t("hideConfig") : t("configure")) : null
					]),
					h("div", { className: cx.subtitle }, t("subtitle")),
					body,
					result && result.available && result.lastRefreshAt != null ? h("div", { className: cx.meta, key: "clock" }, "⟳ " + clockLabel(usage.lastRefreshAt)) : null
				]),
				showForm && writableVal ? h(ConfigForm, { t, scope, config, writable: writableVal, refresh, keyConfigured: !!result && result.available && !result.disabled }) : null
			]);
		}

		// ---- 会话顶栏小徽标（默认关闭）----
		function UsageBadge({ t, useTokenUsage, useTokenUsageConfig, refresh }) {
			const usage = useTokenUsage((s) => s);
			const config = useTokenUsageConfig ? useTokenUsageConfig((s) => s) : null;
			const [open, setOpen] = useState(false);
			const rootRef = useRef(null);
			const popRef = useRef(null);
			const [popStyle, setPopStyle] = useState(null);

			const scopeValue = (config && config.value) || {};
			const badgeOn = scopeValue.headerBadge === true;

			const result = usage.result;
			const total = result && result.available && !result.disabled ? (result.totalTokens || 0) : null;
			const label = usage.phase === "loading" ? "…" : total === null ? t("badgeOff") : compactTokens(total) + " tok";

			const updatePopPosition = useCallback(() => {
				if (!rootRef.current) return;
				const rect = rootRef.current.getBoundingClientRect();
				const vw = document.documentElement.clientWidth || window.innerWidth;
				const margin = 8;
				const width = Math.min(340, Math.max(280, vw - margin * 2));
				const left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, vw - width - margin));
				setPopStyle({ position: "fixed", top: Math.max(margin, rect.bottom + 7) + "px", left: left + "px", width: width + "px" });
			}, []);

			useEffect(() => {
				if (!badgeOn) setOpen(false);
			}, [badgeOn]);

			useEffect(() => {
				if (!open) return;
				updatePopPosition();
				const onViewportChange = () => updatePopPosition();
				window.addEventListener("resize", onViewportChange);
				window.addEventListener("scroll", onViewportChange, true);
				return () => {
					window.removeEventListener("resize", onViewportChange);
					window.removeEventListener("scroll", onViewportChange, true);
				};
			}, [open, updatePopPosition]);

			useEffect(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (rootRef.current && rootRef.current.contains(target)) return;
					if (popRef.current && popRef.current.contains(target)) return;
					setOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => document.removeEventListener("pointerdown", onPointerDown, true);
			}, [open]);

			if (!badgeOn) return null;

			const pop = open ? h("div", {
				className: cx.pop, ref: popRef, style: popStyle || { visibility: "hidden" }, "aria-label": t("popAria")
			}, [
				h(UsageSection, { t, useTokenUsage, useTokenUsageConfig, refresh, scope: null }),
				h("div", { className: cx.formFooter, style: { marginTop: "6px" } }, [
					h("span", { className: cx.spacer }),
					refresh ? h("button", { type: "button", className: cx.btn, disabled: usage.refreshing, onClick: () => { void refresh(); } }, t("refresh")) : null
				])
			]) : null;

			return h("div", { className: cx.pillRoot, ref: rootRef }, [
				h("button", { type: "button", className: cx.pill, "aria-expanded": open, "aria-label": t("pillAria"), onClick: () => setOpen((v) => !v) }, [
					h("span", { className: cx.pillText }, label)
				]),
				open && reactDom && reactDom.createPortal && typeof document !== "undefined" ? reactDom.createPortal(pop, document.body) : null
			]);
		}

		// ---- 语言包 ----
		const zh = {
			title: "今日 Token 用量",
			nav: "今日 Token 用量",
			subtitle: "按模型统计的今日 token 消耗（来自 DSH 会话的 provider usage）",
			todayTotal: "今日总计",
			tokens: "tokens",
			requests: "请求",
			total: "合计",
			thModel: "模型",
			thInput: "输入(未缓存)",
			thOutput: "输出",
			thCacheRead: "缓存读",
			thCacheWrite: "缓存写",
			thTotal: "合计",
			thRequests: "次数",
			refresh: "刷新",
			configure: "配置",
			hideConfig: "收起配置",
			enabled: "启用统计",
			enabledHint: "关闭后不再累计新的用量",
			headerBadge: "会话顶栏显示今日总 token",
			headerBadgeHint: "在会话顶栏常驻一个总 token 徽标，点击可查看明细",
			backfill: "启动时回填今日用量",
			backfillHint: "补上插件启动前/重启期间今天的用量（需 sessionQuery）",
			refreshInterval: "自动刷新间隔（秒）",
			refreshIntervalHint: "10–3600 秒",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			saveFailed: "保存失败，请重试",
			loading: "加载中…",
			unavailable: "今日 Token 用量不可用",
			disabled: "统计已停用",
			noUsage: "今天还没有 token 用量",
			noQueryWarn: "sessionQuery 不可用，仅统计启动后的实时用量",
			backfillDone: "已回填",
			backfillPending: "回填中…",
			badgeOff: "—",
			pillAria: "今日 Token 用量",
			popAria: "今日 Token 用量详情"
		};
		const en = {
			title: "Today's Token Usage",
			nav: "Today's Token Usage",
			subtitle: "Today's token consumption by model (from DSH session provider usage)",
			todayTotal: "Today total",
			tokens: "tokens",
			requests: "requests",
			total: "Total",
			thModel: "Model",
			thInput: "Input (uncached)",
			thOutput: "Output",
			thCacheRead: "Cache read",
			thCacheWrite: "Cache write",
			thTotal: "Total",
			thRequests: "Calls",
			refresh: "Refresh",
			configure: "Configure",
			hideConfig: "Hide config",
			enabled: "Enable tracking",
			enabledHint: "When off, new usage is not accumulated",
			headerBadge: "Show today's total in conversation header",
			headerBadgeHint: "A persistent pill in the session header; click for details",
			backfill: "Backfill today's usage on startup",
			backfillHint: "Covers usage before the plugin loaded / across restarts (needs sessionQuery)",
			refreshInterval: "Auto-refresh interval (s)",
			refreshIntervalHint: "10–3600 s",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			saveFailed: "Save failed, please retry",
			loading: "Loading…",
			unavailable: "Today's token usage unavailable",
			disabled: "Tracking disabled",
			noUsage: "No token usage today yet",
			noQueryWarn: "sessionQuery unavailable — only live usage since startup is counted",
			backfillDone: "Backfilled",
			backfillPending: "Backfilling…",
			badgeOff: "—",
			pillAria: "Today's token usage",
			popAria: "Today's token usage details"
		};

		// ---- 插件主体 ----
		const inject = ["connection", "slots", "locale", "settingsScope"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-token-usage: dictionaries");
			const t = ctx.locale.bind(NS);
			const connection = ctx.get("connection");
			const scope = ctx.settingsScope.bind({ namespace: NS });
			const controller = createController(connection.rpc, scope);

			ctx.effect(() => {
				controller.start();
				return () => controller.stop();
			}, "dsh-token-usage: polling");

			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-token-usage",
				order: 91,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					hooks: {
						tokenUsage: controller.store,
						tokenUsageConfig: controller.scopeStore
					},
					refresh: controller.refresh,
					scope
				})
			}, UsageSection));

			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "dsh-token-usage-badge",
				order: 91,
				locale: NS,
				inject: () => ({
					hooks: { tokenUsage: controller.store, tokenUsageConfig: controller.scopeStore },
					refresh: controller.refresh
				})
			}, UsageBadge));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
