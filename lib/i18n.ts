// 多语言：中文是源语言。切到英文 / 日文时，按需加载 /i18n/{lang}.json，
// 然后在浏览器里把页面上所有中文文字（包括服务器返回的提示、日志）换成译文。
// 词典由 i18n/translations.json 生成（node i18n/build.cjs）。
export type Lang = "zh" | "en" | "ja";
export const LANGS: Record<Lang, string> = { zh: "中文", en: "EN", ja: "日本語" };
const KEY = "sl_lang";

let lang: Lang = "zh";
let exact: Record<string, string> = {};
let tmpl: { re: RegExp; tr: string }[] = [];
const cache = new Map<string, string>();
const CJK = /[一-鿿]/;

export function detectLang(): Lang {
  try { const v = localStorage.getItem(KEY) as Lang | null; if (v && v in LANGS) return v; } catch {}
  const n = (typeof navigator !== "undefined" ? navigator.language : "zh").toLowerCase();
  return n.startsWith("zh") ? "zh" : n.startsWith("ja") ? "ja" : "en";
}
export const currentLang = () => lang;
export function setLang(l: Lang) { try { localStorage.setItem(KEY, l); } catch {} location.reload(); }

const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
export async function initI18n() {
  lang = detectLang();
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  if (lang === "zh") return;
  try {
    const d = (await fetch(`/i18n/${lang}.json`).then((r) => r.json())) as { exact: Record<string, string>; tmpl: [string, string][] };
    exact = d.exact;
    tmpl = d.tmpl.map(([zh, tr]) => ({ re: new RegExp("^" + zh.split(/(\{\d+\})/).map((p) => (/^\{\d+\}$/.test(p) ? "([\\s\\S]*?)" : esc(p).replace(/[{}]/g, "\\$&"))).join("") + "$"), tr }));
  } catch { lang = "zh"; return; }
  startObserver();
}

// 翻译一段文字：先整句查词典，再套模板（模板里的 {n} 递归翻译）
export function t(s: string): string {
  if (lang === "zh" || !s || !CJK.test(s)) return s;
  const hit = cache.get(s); if (hit !== undefined) return hit;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/)!, core = m[2];
  let out = exact[core];
  if (out === undefined) {
    for (const p of tmpl) {
      const g = core.match(p.re); if (!g) continue;
      out = p.tr.replace(/\{(\d+)\}/g, (_, i) => t(g[+i] ?? ""));
      break;
    }
  }
  // 还没对上：按 “ · ”“，”“、” 等分隔符拆开，逐段翻译
  if (out === undefined && /( · |，|、|：| \/ )/.test(core)) { const parts = core.split(/( · |，|、|：| \/ )/); const tp = parts.map((x, i) => (i % 2 ? x : t(x))); if (tp.some((x, i) => x !== parts[i])) out = tp.join(""); }
  const r = out === undefined ? s : m[1] + out + m[3];
  if (cache.size > 5000) cache.clear();
  cache.set(s, r); return r;
}

/* ---------- 页面翻译：盯着 DOM，出现中文就换掉 ---------- */
const done = new WeakMap<Node, string>(); // 节点 → 我们写进去的译文（用来区分 React 新写入的中文）
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
function fixText(n: Text) {
  const v = n.nodeValue || ""; if (done.get(n) === v || !CJK.test(v)) return;
  const p = n.parentElement; if (p && (SKIP.has(p.tagName) || p.closest("[data-no-i18n]"))) return;
  const out = t(v); done.set(n, out); if (out !== v) n.nodeValue = out;
}
function fixEl(el: Element) {
  if (el.closest("[data-no-i18n]")) return;
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v && CJK.test(v)) { const out = t(v); if (out !== v) el.setAttribute(a, out); } }
}
function walk(root: Node) {
  if (root.nodeType === 3) return fixText(root as Text);
  if (root.nodeType !== 1) return;
  const el = root as Element; if (SKIP.has(el.tagName) && el.tagName !== "INPUT") return;
  fixEl(el);
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? fixText(n as Text) : fixEl(n as Element);
}
function startObserver() {
  walk(document.body);
  document.title = t(document.title);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") fixText(m.target as Text);
      else if (m.type === "attributes") fixEl(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
