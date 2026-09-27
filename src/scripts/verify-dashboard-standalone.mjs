/**
 * verify-dashboard-standalone.mjs
 * 校验「Dashboard 单文件版」与仓库真源的一致性 —— 防止两套资金口径漂移（资损风险）。
 *
 * 用法：
 *   node src/scripts/verify-dashboard-standalone.mjs                 # 默认 refund-order
 *   node src/scripts/verify-dashboard-standalone.mjs --fn create-order
 *
 * 检查项：
 *   1. 单文件版不含任何来自 `../_shared/` 的 import（这是它在 Dashboard 能部署成功的前提）
 *   2. TypeScript 解析无语法错误
 *   3. 打桩外部 npm/jsr 依赖后能真实加载模块（可抓出「漏内联常量」这类运行期才炸的错）
 *   4. 业务动作等价：与 index.ts 的「表 + 操作」SQL 序列逐项一致
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 本脚本位于 src/scripts/，项目根在两级之上（2026-09-27 目录迁移后修正）
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));

const argv = process.argv.slice(2);
const fn = argv.includes('--fn') ? argv[argv.indexOf('--fn') + 1] : 'refund-order';

const STD = path.join(ROOT, 'supabase/functions/_dashboard-paste', fn + '.standalone.ts');
const ORIG = path.join(ROOT, 'supabase/functions', fn, 'index.ts');

let fail = 0;
const ok = (cond, label, detail) => {
  console.log((cond ? '  ✅ ' : '  ❌ ') + label + (detail ? '  ' + detail : ''));
  if (!cond) fail++;
};

if (!fs.existsSync(STD)) {
  console.error('❌ 找不到单文件版：' + STD + '\n   先跑：python src/scripts/gen-dashboard-standalone.py --fn ' + fn);
  process.exit(1);
}

const std = fs.readFileSync(STD, 'utf8');
const orig = fs.readFileSync(ORIG, 'utf8');

console.log('校验目标：' + fn);

/* 1. 外部依赖 -------------------------------------------------------------- */
console.log('\n[1] 外部依赖');
const imports = std.split('\n').filter((l) => /^import\s/.test(l));
const sharedImports = imports.filter((l) => l.includes('_shared'));
ok(sharedImports.length === 0, '无来自 ../_shared/ 的 import', '(' + imports.length + ' 个外部包 import 保留)');
imports.forEach((l) => console.log('      ' + l.trim().slice(0, 90)));

/* 2. 语法解析 -------------------------------------------------------------- */
console.log('\n[2] TypeScript 解析');
const sf = ts.createSourceFile(STD, std, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const parseErrs = sf.parseDiagnostics || [];
ok(parseErrs.length === 0, '无语法错误', '(statements=' + sf.statements.length + ')');
parseErrs.slice(0, 5).forEach((d) => {
  const p = sf.getLineAndCharacterOfPosition(d.start);
  console.log('      line ' + (p.line + 1) + ': ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
});

/* 3. 打桩加载（抓运行期未定义标识符） -------------------------------------- */
console.log('\n[3] 打桩加载模块');
try {
  let src = std;
  src = src.replace(
    /import\s*\{\s*createClient\s*\}\s*from\s*'jsr:[^']*'/,
    'const createClient = () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), in: () => ({}) }) }), insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), update: () => ({ eq: async () => ({}) }) }), auth: { getUser: async () => ({ data: { user: null } }) }, functions: { invoke: () => Promise.resolve() } })'
  );
  src = src.replace(/import\s+(\w+)\s+from\s*'npm:[^']*'/g, 'const $1 = class { constructor(){} rnd(){ return "abcd1234" } }');
  src = src.replace(/^Deno\.serve\s*\(\s*(\w+)\s*\)\s*$/m, 'globalThis.__fn_export = $1');
  src = 'globalThis.Deno = { env: { get: () => "" }, serve: () => {} };\n' + src;

  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const tmp = path.join(os.tmpdir(), 'standalone-verify-' + Date.now() + '.mjs');
  fs.writeFileSync(tmp, js, 'utf8');
  try {
    await import(url.pathToFileURL(tmp).href);
  } finally {
    fs.unlinkSync(tmp);
  }
  ok(true, '模块求值成功（无未定义标识符 / ReferenceError）');
  ok(typeof globalThis.__fn_export === 'function', '入口 handler 已正确导出为函数');
} catch (e) {
  ok(false, '模块求值失败', e.name + ': ' + e.message);
}

/* 4. 业务动作等价 ---------------------------------------------------------- */
console.log('\n[4] 业务动作等价（表 + 操作 序列）');
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/\s.*$/gm, '');
const seq = (s) => (s.match(/from\('([a-z_]+)'\)\s*\.\s*(insert|update|select|delete)/g) || []).map((x) => x.replace(/\s+/g, ' '));
const a = seq(strip(orig));
const b = seq(strip(std));
ok(a.length === b.length && a.length > 0, 'SQL 操作步数一致', '(' + a.length + ' 步)');
const same = a.length === b.length && a.every((x, i) => x === b[i]);
ok(same, 'SQL 操作序列逐项一致');
if (!same) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) console.log('      差异 @' + i + '\n        ORIG: ' + a[i] + '\n        STD : ' + b[i]);
  }
}

console.log('\n' + (fail === 0 ? '✅ 全部通过：单文件版与仓库真源一致' : '❌ 有 ' + fail + ' 项未通过'));
process.exit(fail === 0 ? 0 : 1);
