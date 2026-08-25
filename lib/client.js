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
			".dshu-body{flex-direction:column;gap:9px;margin-top:4px;min-width:0;display:flex}",
			".dshu-card{box-sizing:border-box;position:relative;overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-layer-2,#F5F7FA) 88%,transparent),color-mix(in srgb,var(--dsw-alias-bg-layer-2,#F5F7FA) 68%,transparent));border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 60%,transparent);border-radius:14px;padding:13px 15px;box-shadow:0 1px 2px rgba(16,40,56,.05),0 10px 26px rgba(16,40,56,.08)}",
			".dshu-card::before{content:'';position:absolute;top:0;left:14px;right:14px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent)}",
			".dshu-head{align-items:center;gap:8px;min-width:0;display:flex}",
			".dshu-title{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:13px;font-weight:700;line-height:1.4;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}",
			".dshu-subtitle{display:flex;align-items:baseline;gap:10px;min-width:0;margin-top:2px}",
			".dshu-subtitle .dshu-metaRight{font-size:9px;line-height:13px}",
			".dshu-subtitleText{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:9px;line-height:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}",
			".dshu-spacer{flex:1;min-width:8px}",
			".dshu-btn{appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary,#5A6B82);background:color-mix(in srgb,var(--dsw-alias-bg-base,#FFFFFF) 50%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 55%,transparent);border-radius:8px;padding:3px 11px;font-size:12px;line-height:18px;display:inline-flex;align-items:center;gap:4px;transition:background .15s ease,border-color .15s ease}",
			".dshu-btn:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#EEF2F6) 80%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 80%,transparent)}",
			".dshu-btn:disabled{opacity:.5;cursor:default}",
			".dshu-totalRow{display:flex;align-items:baseline;gap:10px;margin-top:4px;min-width:0}",
			".dshu-totalLabel{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:12px;line-height:18px}",
			".dshu-totalValue{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:22px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}",
			".dshu-totalMeta{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px}",
			".dshu-table{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}",
			".dshu-th{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px;font-weight:600;text-align:right;padding:4px 6px;white-space:nowrap}",
			".dshu-thL,.dshu-tdL{text-align:left}",
			".dshu-td{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:12px;line-height:18px;text-align:right;padding:4px 6px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dshu-modelCell{width:var(--dshu-model-width,260px);max-width:min(var(--dshu-model-max,420px),100%);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#2E3A4D)}",
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
			".dshu-meta{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:10px;line-height:15px;font-variant-numeric:tabular-nums}",
			".dshu-pillRoot{position:relative;display:inline-flex}",
			".dshu-pill{min-height:26px;cursor:pointer;color:var(--dsw-alias-label-secondary,#5A6B82);background:var(--dsw-alias-bg-layer-2,#F5F7FA);border:1px solid var(--dsw-alias-border-l2,#335A6B82);border-radius:999px;align-items:center;gap:5px;padding:2px 8px;font-size:11px;line-height:18px;display:inline-flex;font-variant-numeric:tabular-nums}",
			".dshu-pillText{white-space:nowrap}",
			".dshu-pill:hover{background:var(--dsw-alias-bg-layer-3,#EEF2F6)}",
			"@keyframes dshuPopIn{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}",
			".dshu-pop{z-index:2147483647;box-sizing:border-box;position:fixed;max-width:calc(100vw - 16px);max-height:70vh;overflow:auto;color:var(--dsw-alias-label-primary,#2E3A4D);background:var(--dsw-specific-menu,#FDFEFF);-webkit-backdrop-filter:blur(14px) saturate(1.25);backdrop-filter:blur(14px) saturate(1.25);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#4D6B7B9C) 75%,transparent);border-radius:14px;box-shadow:0 2px 6px rgba(16,40,56,.06),0 16px 40px rgba(16,40,56,.16);flex-direction:column;gap:8px;padding:14px;display:flex;transform-origin:top right;animation:dshuPopIn .18s ease-out}",
			"@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)){.dshu-pop{background:color-mix(in srgb,var(--dsw-specific-menu,#FDFEFF) 84%,transparent)}}",
			".dshu-scroll{width:100%;overflow-x:auto;overflow-y:hidden}",
			".dshu-grid{width:100%;display:grid;grid-template-columns:minmax(0,max-content) repeat(6,minmax(0,1fr));margin-top:8px}",
			".dshu-gcell{padding:4px 6px;font-size:12px;line-height:18px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#2E3A4D)}",
			".dshu-gcellL{text-align:left}",
			".dshu-ghead{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8A99AD);font-weight:600}",
			".dshu-gtotal{border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 45%,transparent);font-weight:700}",
			".dshu-gmodel{position:relative;padding-bottom:18px;min-width:0}",
			".dshu-gmodel .dshu-provider{position:absolute;left:6px;right:6px;top:20px}",
			".dshu-compactList{display:flex;flex-direction:column;gap:1px;margin-top:8px}",
			".dshu-compactRow{display:flex;align-items:baseline;gap:10px;min-width:0;padding:3px 0}",
			".dshu-compactName{flex:1 1 auto;min-width:0;overflow:hidden;font-size:12px;line-height:18px}",
			".dshu-compactMain{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#2E3A4D);font-size:12px;line-height:18px}",
			".dshu-compactTotal{flex:none;text-align:right;font-variant-numeric:tabular-nums;font-weight:650;color:var(--dsw-alias-label-primary,#2E3A4D);white-space:nowrap;font-size:12px;line-height:18px}",
			".dshu-compactRow.dshu-trTotal .dshu-compactName{color:var(--dsw-alias-label-tertiary,#8A99AD);font-weight:400}",
			".dshu-summaryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}",
			".dshu-summaryItem{box-sizing:border-box;min-width:0;background:color-mix(in srgb,var(--dsw-alias-bg-base,#FFFFFF) 58%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 42%,transparent);border-radius:10px;padding:7px 10px 8px;flex-direction:column;gap:1px;display:flex}",
			".dshu-summaryHead{display:flex;align-items:center;gap:4px;min-width:0}",
			".dshu-summaryIcon{flex:none;color:currentColor;display:inline-flex}",
			".dshu-summaryLabel{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;line-height:16px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}",
			".dshu-summaryValue{color:var(--dsw-alias-label-primary,#2E3A4D);font-size:16px;font-weight:700;line-height:22px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dshu-chartCard{margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 42%,transparent)}",
			".dshu-chartTitle{color:var(--dsw-alias-label-secondary,#5A6B82);font-size:12px;font-weight:650;line-height:18px;margin-bottom:6px}",
			".dshu-chart{width:100%;min-width:520px;height:220px;display:block}",
			".dshu-chartAxis{fill:var(--dsw-alias-label-tertiary,#8A99AD);font-size:10px}",
			".dshu-chartGrid{stroke:color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 30%,transparent);stroke-width:1}",
			".dshu-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px}",
			".dshu-legendItem{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:240px;color:var(--dsw-alias-label-secondary,#5A6B82);font-size:11px}",
			".dshu-legendSwatch{width:8px;height:8px;border-radius:2px;flex:none}",
			".dshu-legendText{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dshu-chartTip{position:absolute;z-index:5;pointer-events:none;max-width:280px;padding:7px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-4,#263645);color:#fff;font-size:11px;line-height:16px;box-shadow:0 5px 18px rgba(0,0,0,.2)}",
			".dshu-sectionGap{margin-top:12px}",
			".dshu-metaRow{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:5px;min-height:15px}",
			".dshu-metaLeft{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:10px;line-height:15px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-variant-numeric:tabular-nums}",
			".dshu-metaRight{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:10px;line-height:15px;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}",
			".dshu-collapse{box-sizing:border-box;width:100%;min-height:32px;appearance:none;cursor:pointer;color:var(--dsw-alias-label-secondary,#5A6B82);background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 42%,transparent);border-radius:0;padding:7px 2px 8px;display:flex;align-items:center;gap:7px;font:inherit;font-size:12px;line-height:18px;text-align:left;transition:color .15s ease,border-color .15s ease}",
			".dshu-collapse:hover{color:var(--dsw-alias-label-primary,#2E3A4D);border-bottom-color:color-mix(in srgb,var(--dsw-alias-border-l2,#335A6B82) 78%,transparent)}",
			".dshu-collapseIcon{width:14px;height:14px;color:var(--dsw-alias-label-tertiary,#8A99AD);display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:14px;flex:none}",
			".dshu-collapseLabel{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dshu-collapseMeta{color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:11px;white-space:nowrap}",
			".dshu-collapseArrow{margin-left:auto;color:var(--dsw-alias-label-tertiary,#8A99AD);font-size:13px;line-height:14px;transition:transform .18s ease}",
			".dshu-collapseArrowOpen{transform:rotate(180deg);color:var(--dsw-alias-label-secondary,#5A6B82)}",
			".dshu-chevron{font-size:11px;transition:transform .15s ease}",
			".dshu-chevronOpen{transform:rotate(180deg)}",
		].join("");

		if (typeof document !== "undefined" && typeof document.head !== "undefined") {
			const style = document.createElement("style");
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		const cx = {
			root: "dshu-root", body: "dshu-body", card: "dshu-card", head: "dshu-head", title: "dshu-title",
			subtitle: "dshu-subtitle", spacer: "dshu-spacer", btn: "dshu-btn",
			totalRow: "dshu-totalRow", totalLabel: "dshu-totalLabel", totalValue: "dshu-totalValue", totalMeta: "dshu-totalMeta",
			table: "dshu-table", th: "dshu-th", thL: "dshu-thL", td: "dshu-td", tdL: "dshu-tdL",
			modelCell: "dshu-modelCell", provider: "dshu-provider", tdTotal: "dshu-tdTotal", trTotal: "dshu-trTotal",
			empty: "dshu-empty", banner: "dshu-banner", bannerErr: "dshu-bannerErr", bannerWarn: "dshu-bannerWarn",
			form: "dshu-form", field: "dshu-field", fieldRow: "dshu-fieldRow", fieldHead: "dshu-fieldHead", label: "dshu-label",
			input: "dshu-input", check: "dshu-check", hint: "dshu-hint", formFooter: "dshu-formFooter",
			saveBtn: "dshu-saveBtn", meta: "dshu-meta",
			pillRoot: "dshu-pillRoot", pill: "dshu-pill", pillText: "dshu-pillText", pop: "dshu-pop", scroll: "dshu-scroll", summaryGrid: "dshu-summaryGrid", summaryItem: "dshu-summaryItem", summaryHead: "dshu-summaryHead", summaryIcon: "dshu-summaryIcon", summaryLabel: "dshu-summaryLabel", summaryValue: "dshu-summaryValue", chartCard: "dshu-chartCard", chartTitle: "dshu-chartTitle", chart: "dshu-chart", chartAxis: "dshu-chartAxis", chartGrid: "dshu-chartGrid", legend: "dshu-legend", legendItem: "dshu-legendItem", legendSwatch: "dshu-legendSwatch", legendText: "dshu-legendText", sectionGap: "dshu-sectionGap", collapse: "dshu-collapse", collapseIcon: "dshu-collapseIcon", collapseLabel: "dshu-collapseLabel", collapseMeta: "dshu-collapseMeta", collapseArrow: "dshu-collapseArrow", collapseArrowOpen: "dshu-collapseArrowOpen", metaRow: "dshu-metaRow", metaLeft: "dshu-metaLeft", metaRight: "dshu-metaRight", compactList: "dshu-compactList", compactRow: "dshu-compactRow", compactName: "dshu-compactName", compactMain: "dshu-compactMain", compactTotal: "dshu-compactTotal", grid: "dshu-grid", gcell: "dshu-gcell", gcellL: "dshu-gcellL", ghead: "dshu-ghead", gtotal: "dshu-gtotal", gmodel: "dshu-gmodel"
		};

		const h = react.createElement;
		const { useState, useEffect, useRef, useCallback } = react;
		const NS = "dsh-token-usage";

		// ---- 纯函数 ----
		function formatExact(n) {
			if (typeof n !== "number" || !Number.isFinite(n)) return "—";
			return Math.round(n).toLocaleString("en-US");
		}
		function formatCompact(n) {
			if (typeof n !== "number" || !Number.isFinite(n)) return "—";
			const value = Math.abs(n);
			if (value < 1000) return String(Math.round(n));
			const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
			for (const [div, suffix] of units) {
				if (value >= div) {
					const v = n / div;
					return String(Number(v.toFixed(1))) + suffix;
				}
			}
			return String(n);
		}
		function exactTokens(n) { return formatExact(n); }
		function compactTokens(n) { return formatCompact(n); }
		function cacheHitRate(row) {
			const input = Number(row && row.uncachedInputTokens) || 0;
			const cached = Number(row && row.cacheReadTokens) || 0;
			const total = input + cached;
			return total > 0 ? cached / total * 100 : null;
		}
		function hitRateLabel(row) {
			const rate = cacheHitRate(row);
			return rate === null ? "—" : Number(rate.toFixed(1)) + "%";
		}
		function numberCell(n) {
			return h("span", { title: formatExact(n) }, formatCompact(n));
		}
		function two(n) { return n < 10 ? "0" + n : String(n); }
		function clockLabel(ts) {
			if (!ts) return "—";
			const d = new Date(ts);
			return two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
		}
		function dateLabel(date) { return date || ""; }
		// ---- 轮询控制器 ----
		function createController(rpc, scope) {
			const store = runtime.createSnapshotStore({ phase: "loading", result: null, lastRefreshAt: null, refreshing: false, error: null });
			const daysStore = runtime.createSnapshotStore({ phase: "loading", result: null, lastRefreshAt: null, refreshing: false, error: null });
			const scopeStore = runtime.createSnapshotStore({ status: "loading", value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: "host" });
			const syncScope = () => {
				const snap = scope.getSnapshot();
				scopeStore.update((d) => { Object.assign(d, { status: snap.status, value: snap.value, base: snap.base, user: snap.user, revision: snap.revision, writable: snap.writable, mode: snap.mode }); });
			};
			const offScope = scope.subscribe(() => syncScope());
			syncScope();
			let inFlight = false;
			let timer = null;
			async function refreshOne(targetStore, endpoint) {
				targetStore.update((d) => { d.refreshing = true; d.error = null; });
				try {
					const out = await rpc.call("/dsh-token-usage", endpoint, {});
					const value = out && out.ok ? out.value : null;
					targetStore.update((d) => { d.phase = "ready"; d.result = value; d.lastRefreshAt = Date.now(); d.refreshing = false; });
				} catch (error) {
					targetStore.update((d) => { d.phase = "ready"; d.error = error instanceof Error ? error.message : String(error); d.refreshing = false; });
				}
			}
			async function refresh() {
				if (inFlight) return;
				inFlight = true;
				await Promise.all([refreshOne(store, "today"), refreshOne(daysStore, "last7days")]);
				inFlight = false;
			}
			function intervalSec() {
				const snap = scope.getSnapshot();
				const sec = snap && snap.value && typeof snap.value.refreshIntervalSec === "number" ? snap.value.refreshIntervalSec : 60;
				return Math.max(10, Math.min(3600, Math.round(sec)));
			}
			function schedule() { if (timer) clearInterval(timer); timer = setInterval(() => { void refresh(); }, intervalSec() * 1000); }
			function start() { void refresh(); schedule(); }
			function stop() { if (timer) { clearInterval(timer); timer = null; } offScope(); }
			return { store, daysStore, scopeStore, refresh, start, stop, schedule };
		}
		// ---- 今日用量表格与最近 7 日图 ----
		const SUMMARY_ICONS = {
			tokens: [["circle", { cx: 8, cy: 8, r: 6.2 }], ["path", { d: "M8 4.6v6.8m2 -4.15c-.35-.88-1.05-1.32-1.95-1.32-1.15 0-2.05.63-2.05 1.58 0 2.28 4.1 1.22 4.1 3.1 0 .95-.9 1.58-2.05 1.58-.98 0-1.72-.48-2.02-1.38" }]],
			requests: [["path", { d: "M2 12l4-4 3 3 5-6" }], ["path", { d: "M11 2h3v3" }]],
			hitRate: [["circle", { cx: 8, cy: 8, r: 6.2 }], ["path", { d: "M5 9.2l2 2 4-5" }]]
		};
		function summaryIcon(name, color) {
			return h("svg", { className: cx.summaryIcon, viewBox: "0 0 16 16", width: 13, height: 13, fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: color ? { color } : undefined }, SUMMARY_ICONS[name].map((part, i) => h(part[0], { key: i, ...part[1] })));
		}
		function modelLabel(m) { return m.modelName && m.modelName !== m.model ? m.modelName : m.model; }
		function modelSub(m) { return [m.modelName && m.modelName !== m.model ? m.model : null, m.provider || null].filter(Boolean).join(" · "); }
		function modelColumnStyle(models) {
			const names = Array.isArray(models) ? models.map(modelLabel).filter(Boolean) : [];
			const longest = names.reduce((max, value) => Math.max(max, String(value).length), 0);
			const width = Math.max(150, Math.min(420, longest * 7.2 + 24));
			return { "--dshu-model-width": width + "px", "--dshu-model-max": "420px" };
		}
		function modelKey(m) { return String(m.provider || "") + "\u0000" + String(m.model || ""); }
		function stableColor(key, index) {
			const colors = ["#4F8EF7", "#36B37E", "#F6A623", "#E85AAD", "#8B6CF6", "#20B8C9", "#F06464", "#778899"];
			let hash = 0; for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
			return colors[(hash + index) % colors.length];
		}
		function CollapseHeader({ icon, label, meta, open, onClick }) { return h("button", { type: "button", className: cx.collapse, onClick, "aria-expanded": open }, [h("span", { className: cx.collapseIcon, "aria-hidden": true }, icon), h("span", { className: cx.collapseLabel }, label), meta ? h("span", { className: cx.collapseMeta }, meta) : null, h("span", { className: cx.collapseArrow + (open ? " " + cx.collapseArrowOpen : ""), "aria-hidden": true }, h("svg", { viewBox: "0 0 16 16", width: 12, height: 12 }, h("path", { d: "M3.5 6l4.5 4.5 4.5-4.5", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" })))]); }
		function SummaryGrid({ result, t }) {
			const models = Array.isArray(result && result.models) ? result.models : [];
			const hit = models.reduce((a, m) => { a.input += Number(m.uncachedInputTokens) || 0; a.cached += Number(m.cacheReadTokens) || 0; return a; }, { input: 0, cached: 0 });
			const hitRate = hit.input + hit.cached > 0 ? hit.cached / (hit.input + hit.cached) * 100 : null;
			const GREEN = "#2FBE77";
			const items = [
				{ name: "tokens", label: t("summaryTokens"), value: formatCompact(result && result.totalTokens || 0), title: formatExact(result && result.totalTokens || 0) },
				{ name: "requests", label: t("summaryRequests"), value: String(result && result.requests || 0), title: formatExact(result && result.requests || 0) },
				{ name: "hitRate", label: t("summaryHitRate"), value: hitRate === null ? "—" : Number(hitRate.toFixed(1)) + "%", title: hitRate === null ? "—" : Number(hitRate.toFixed(1)) + "%", color: GREEN }
			];
			return h("div", { className: cx.summaryGrid }, items.map((item, i) => h("div", { className: cx.summaryItem, key: i, title: item.title, style: item.color ? { color: item.color } : null }, [h("div", { className: cx.summaryHead }, [summaryIcon(item.name, item.color), h("div", { className: cx.summaryLabel }, item.label)]), h("div", { className: cx.summaryValue, style: item.color ? { color: item.color } : null }, item.value)] )));
		}
		function UsageTable({ result, t, compact = false }) {
			const models = Array.isArray(result.models) ? result.models : [];
			if (models.length === 0) return h("div", { className: cx.empty }, t("noUsage"));
			const total = models.reduce((acc, m) => ({ uncachedInputTokens: acc.uncachedInputTokens + (m.uncachedInputTokens || 0), outputTokens: acc.outputTokens + (m.outputTokens || 0), cacheReadTokens: acc.cacheReadTokens + (m.cacheReadTokens || 0), totalTokens: acc.totalTokens + (m.totalTokens || 0), requests: acc.requests + (m.requests || 0) }), { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalTokens: 0, requests: 0 });
			const cell = (n) => h("span", { title: formatExact(n) }, formatCompact(n));
			if (compact) {
				return h("div", { className: cx.compactList }, [
					...models.map((m, i) => { const sub = modelSub(m); return h("div", { className: cx.compactRow, key: "m" + i, title: [modelLabel(m), sub].filter(Boolean).join(" · ") }, [ h("div", { className: cx.compactName }, [ h("span", { className: cx.compactMain }, modelLabel(m)), sub ? h("span", { className: cx.provider }, sub) : null ]), h("div", { className: cx.compactTotal, title: formatExact(m.totalTokens || 0) }, formatCompact(m.totalTokens || 0)) ]); }),
					h("div", { className: cx.compactRow + " " + cx.trTotal, key: "total" }, [ h("div", { className: cx.compactName }, t("total")), h("div", { className: cx.compactTotal, title: formatExact(total.totalTokens) }, formatCompact(total.totalTokens)) ])
				]);
			}
			const cols = ["model", "input", "output", "cacheRead", "hitRate", "total", "requests"];
			const labels = { model: t("thModel"), input: t("thInput"), output: t("thOutput"), cacheRead: t("thCacheRead"), hitRate: t("thHitRate"), total: t("thTotal"), requests: t("thRequests") };
			const mc = (m) => { const sub = modelSub(m); return h("div", { className: cx.gcell + " " + cx.gcellL + " " + cx.gmodel, title: [modelLabel(m), sub].filter(Boolean).join(" · ") }, [h("span", { className: cx.compactMain }, modelLabel(m)), sub ? h("span", { className: cx.provider }, sub) : null]); };
			const cells = [];
			cols.forEach((k) => cells.push(h("div", { key: "h" + k, className: cx.gcell + " " + cx.ghead + (k === "model" ? " " + cx.gcellL : "") }, labels[k])));
			models.forEach((m, i) => { const sub = modelSub(m); cells.push(mc(m), h("div", { key: "i" + i, className: cx.gcell }, cell(m.uncachedInputTokens)), h("div", { key: "o" + i, className: cx.gcell }, cell(m.outputTokens)), h("div", { key: "c" + i, className: cx.gcell }, cell(m.cacheReadTokens)), h("div", { key: "h" + i, className: cx.gcell, title: hitRateLabel(m) }, hitRateLabel(m)), h("div", { key: "t" + i, className: cx.gcell + " " + cx.tdTotal }, cell(m.totalTokens)), h("div", { key: "r" + i, className: cx.gcell, title: formatExact(m.requests || 0) }, String(m.requests || 0))); });
			cells.push(h("div", { key: "tm", className: cx.gcell + " " + cx.gcellL + " " + cx.gtotal }, t("total")), h("div", { key: "ti", className: cx.gcell + " " + cx.gtotal }, cell(total.uncachedInputTokens)), h("div", { key: "to", className: cx.gcell + " " + cx.gtotal }, cell(total.outputTokens)), h("div", { key: "tc", className: cx.gcell + " " + cx.gtotal }, cell(total.cacheReadTokens)), h("div", { key: "th", className: cx.gcell + " " + cx.gtotal, title: hitRateLabel(total) }, hitRateLabel(total)), h("div", { key: "tt", className: cx.gcell + " " + cx.gtotal }, cell(total.totalTokens)), h("div", { key: "tr", className: cx.gcell + " " + cx.gtotal }, String(total.requests)));
			return h("div", { className: cx.grid }, cells);
		}
		function Last7DaysChart({ result, t }) {
			const days = Array.isArray(result && result.days) ? result.days : [];
			if (!days.length) return h("div", { className: cx.empty }, t("chartEmpty"));
			const models = []; const seen = new Set();
			for (const day of days) for (const m of day.models || []) { const key = modelKey(m); if (!seen.has(key)) { seen.add(key); models.push({ ...m, key }); } }
			const modelTotal = (key) => days.reduce((sum, d) => { const item = (d.models || []).find(m => modelKey(m) === key); return sum + (item ? item.totalTokens || 0 : 0); }, 0);
			models.sort((a, b) => modelTotal(b.key) - modelTotal(a.key));
			const max = Math.max(1, ...days.map(d => d.totalTokens || 0)); const W = 640, H = 210, left = 42, right = 10, top = 12, bottom = 30; const plotW = W - left - right, plotH = H - top - bottom; const gap = 14, barW = Math.max(20, (plotW - gap * (days.length - 1)) / days.length);
			const ticks = [0, max / 2, max];
			const y = (v) => top + plotH - (v / max) * plotH;
			const segments = [];
			const bars = days.map((day, di) => { let cursor = 0; const x = left + di * (barW + gap); return (day.models || []).map((m) => { const value = m.totalTokens || 0; const hgt = value / max * plotH; const seg = { x, y: y(cursor + value), width: barW, height: hgt, m, day, color: stableColor(modelKey(m), models.findIndex(x => x.key === modelKey(m))), key: modelKey(m) + di }; cursor += value; segments.push(seg); return seg; }); });
			return h("div", { className: cx.chartCard }, [h("div", { className: cx.chartTitle }, t("last7Days")), h("svg", { className: cx.chart, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("last7Days") }, [ ...ticks.map((v, i) => h("g", { key: "tick" + i }, [h("line", { className: cx.chartGrid, x1: left, x2: W - right, y1: y(v), y2: y(v) }), h("text", { className: cx.chartAxis, x: left - 6, y: y(v) + 3, textAnchor: "end" }, formatCompact(v))])), ...segments.map((s) => h("rect", { key: s.key, x: s.x, y: s.y, width: s.width, height: Math.max(0, s.height), fill: s.color, rx: 2 }, h("title", null, `${s.day.date} · ${modelLabel(s.m)} · ${modelSub(s.m)} · ${formatCompact(s.m.totalTokens || 0)} (${formatExact(s.m.totalTokens || 0)}) · ${t("summaryTokens")} ${formatCompact(s.day.totalTokens || 0)} (${formatExact(s.day.totalTokens || 0)})`))), ...days.map((d, i) => h("text", { key: "date" + i, className: cx.chartAxis, x: left + i * (barW + gap) + barW / 2, y: H - 10, textAnchor: "middle" }, d.date.slice(5)))]), h("div", { className: cx.legend }, models.map((m, i) => h("div", { className: cx.legendItem, key: m.key, title: [modelLabel(m), modelSub(m)].filter(Boolean).join(" · ") }, [h("span", { className: cx.legendSwatch, style: { background: stableColor(m.key, i) } }), h("span", { className: cx.legendText }, modelLabel(m))])))]);
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
		function UsageSection({ t, useTokenUsage, useTokenUsageConfig, useTokenUsageDays, refresh, scope, showTrend = true, showSubtitle = true, compactModels = false, bare = false }) {
			const usage = useTokenUsage((s) => s);
			const daysUsage = useTokenUsageDays ? useTokenUsageDays((s) => s) : { result: null, phase: "loading" };
			const config = useTokenUsageConfig((s) => s);
			const [showForm, setShowForm] = useState(false);
			const [showModels, setShowModels] = useState(!compactModels);
			const [showTrendPanel, setShowTrendPanel] = useState(false);
			const writableVal = config ? config.writable : false;
			const result = usage.result;
			const refreshing = !!usage.refreshing;
			const title = result && result.date ? t("title") + " (" + result.date + ")" : t("title");
			let body;
			if (!result || result.available === false) body = h("div", { className: cx.empty }, result && result.error ? result.error.message : t("unavailable"));
			else if (result.disabled) body = h("div", { className: cx.empty }, t("disabled"));
			else body = [
				h(SummaryGrid, { result, t, key: "summary" }),
				compactModels ? h("div", { className: cx.sectionGap, key: "modelToggle" }, h(CollapseHeader, { icon: "▦", label: t("modelDetails"), meta: (result.models || []).length + " " + t("modelCount"), open: showModels, onClick: () => setShowModels((v) => !v) })) : null,
				showModels ? h("div", { className: cx.sectionGap, key: "table" }, h(UsageTable, { result, t, compact: compactModels })) : null,
				!showSubtitle ? h("div", { className: cx.metaRow, key: "meta" }, [h("span", { className: cx.metaLeft }, result.backfillDone ? t("backfillDone") : t("backfillPending")), h("span", { className: cx.metaRight }, "⟳ " + clockLabel(usage.lastRefreshAt))]) : null,
				!compactModels && showTrend ? h("div", { className: cx.sectionGap, key: "trendToggle" }, [h(CollapseHeader, { icon: "▥", label: t("last7Days"), meta: t("byModel"), open: showTrendPanel, onClick: () => setShowTrendPanel((v) => !v) }), showTrendPanel ? h(Last7DaysChart, { result: daysUsage.result, t, key: "chart" }) : null]) : null,
				!result.sessionQueryAvailable ? h("div", { className: cx.banner + " " + cx.bannerWarn, key: "noquery" }, [h("span", { key: "i" }, "⚠"), h("span", { key: "m" }, t("noQueryWarn"))]) : null
			];
			const inner = [
				h("div", { className: cx.head }, [h("span", { className: cx.title, title }, title), h("span", { className: cx.spacer }), refresh ? h("button", { type: "button", className: cx.btn, disabled: refreshing, onClick: () => { void refresh(); } }, t("refresh")) : null, writableVal && scope ? h("button", { type: "button", className: cx.btn, onClick: () => setShowForm((v) => !v) }, showForm ? t("hideConfig") : t("configure")) : null]),
				showSubtitle ? h("div", { className: cx.subtitle }, [h("span", { className: cx.subtitleText, style: { fontSize: "9px", lineHeight: "13px" } }, t("subtitle")), h("span", { className: cx.spacer }), h("span", { className: cx.metaRight }, (result.backfillDone ? t("backfillDone") : t("backfillPending")) + " · ⟳ " + clockLabel(usage.lastRefreshAt))]) : null,
				body,
				showForm && writableVal ? h(ConfigForm, { t, scope, config, writable: writableVal, refresh, keyConfigured: !!result && result.available && !result.disabled }) : null
			];
			return bare ? h("div", { className: cx.body }, inner) : h("div", { className: cx.root }, [ h("div", { className: cx.card, key: "card" }, inner) ]);
		}
		// ---- 会话顶栏小徽标（默认关闭）----
		function UsageBadge({ t, useTokenUsage, useTokenUsageConfig, useTokenUsageDays, refresh }) {
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
				h(UsageSection, { t, useTokenUsage, useTokenUsageConfig, useTokenUsageDays, refresh, scope: null, showTrend: false, showSubtitle: false, compactModels: true, bare: true }),
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
			title: "Token 用量",
			nav: "Token 用量",
			subtitle: "按模型统计的今日 token 消耗",
			todayTotal: "今日总计",
			tokens: "tokens",
			requests: "请求",
			summaryTokens: "总 Token",
			summaryRequests: "请求数",
			summaryHitRate: "命中率",
			modelDetails: "模型明细",
			modelCount: "个模型",
			byModel: "按模型统计",
			last7Days: "最近 7 日 Token 用量",
			chartEmpty: "最近 7 日暂无用量",
			total: "合计",
			thModel: "模型",
			thInput: "输入",
			thOutput: "输出",
			thCacheRead: "缓存读",
			thHitRate: "命中率",
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
			title: "Token Usage",
			nav: "Token Usage",
			subtitle: "Today's token consumption by model",
			todayTotal: "Today total",
			tokens: "tokens",
			requests: "requests",
			summaryTokens: "Total tokens",
			summaryRequests: "Requests",
			summaryHitRate: "Hit rate",
			modelDetails: "Model details",
			modelCount: "models",
			byModel: "By model",
			last7Days: "Last 7 days token usage",
			chartEmpty: "No usage in the last 7 days",
			total: "Total",
			thModel: "Model",
			thInput: "Input",
			thOutput: "Output",
			thCacheRead: "Cache read",
			thHitRate: "Cache hit",
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
						tokenUsageConfig: controller.scopeStore,
						tokenUsageDays: controller.daysStore
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
					hooks: { tokenUsage: controller.store, tokenUsageConfig: controller.scopeStore, tokenUsageDays: controller.daysStore },
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