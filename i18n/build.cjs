// 把 i18n/translations.json（中文 → [英文, 日文]）拆成前端按需加载的 public/i18n/en.json、ja.json
const fs = require("fs"), path = require("path");
const src = { ...JSON.parse(fs.readFileSync(path.join(__dirname, "translations.json"), "utf8")), ...JSON.parse(fs.readFileSync(path.join(__dirname, "extra.json"), "utf8")) };
for (const [lang, i] of [["en", 0], ["ja", 1]]) {
  const exact = {}, tmpl = [];
  for (const [raw, tr] of Object.entries(src)) {
    // 前后空格不算：页面上的文字会先去掉首尾空白再查
    const zh = raw.trim(), t = (tr[i] || "").trim(); if (!t || t === zh) continue;
    if (/\{\d+\}/.test(zh)) tmpl.push([zh, t]); else exact[zh] = t;
  }
  // 字面部分越长越先匹配，避免 "{1}{2}" 这种宽泛模板抢先
  tmpl.sort((a, b) => b[0].replace(/\{\d+\}/g, "").length - a[0].replace(/\{\d+\}/g, "").length);
  fs.mkdirSync(path.join(__dirname, "../public/i18n"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, `../public/i18n/${lang}.json`), JSON.stringify({ exact, tmpl }));
}
console.log("i18n built");
