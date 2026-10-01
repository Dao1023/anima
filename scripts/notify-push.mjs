// notify-push.mjs · 喊人手:WxPusher 微信推送(主人不在电脑前时用)
// 用法: node scripts/notify-push.mjs -summary "一句话" [-text "详情,缺省同 summary"]
// 配置(仓库外,防泄漏): C:\Users\Dao\.anima\wxpusher.json  {"appToken":"AT_xxx","uid":"UID_xxx"}
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(url.fileURLToPath(import.meta.url)) + '/..';
const CONFIG = path.join(process.env.USERPROFILE || 'C:\\Users\\Dao', '.anima', 'wxpusher.json');

function arg(name) {
  const i = process.argv.indexOf('-' + name);
  return i > -1 ? process.argv[i + 1] : null;
}

const summary = arg('summary') || '女仆找你';
const text = arg('text') || summary;

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
} catch {
  console.error(JSON.stringify({ push: 'config_missing', path: CONFIG }));
  process.exit(2);
}

const body = JSON.stringify({
  appToken: cfg.appToken,
  content: text,
  summary: summary.slice(0, 99),
  contentType: 1,
  uids: [cfg.uid],
});

// sandbox 下 execFileSync curl 更稳
try {
  const out = execFileSync('curl.exe', ['-s', '-X', 'POST',
    'https://wxpusher.zjiecode.com/api/send/message',
    '-H', 'Content-Type: application/json; charset=utf-8',
    '-d', body], { timeout: 20000 }).toString();
  const r = JSON.parse(out);
  if (r.code === 1000) console.log(JSON.stringify({ push: 'sent', uid: cfg.uid }));
  else { console.error(JSON.stringify({ push: 'failed', code: r.code, msg: r.msg })); process.exit(1); }
} catch (e) {
  console.error(JSON.stringify({ push: 'error', msg: e.message.split('\n')[0] }));
  process.exit(1);
}
