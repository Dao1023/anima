// sense-face.mjs · 摄像头探头:抓一帧 → human(识别主人/视线/头姿) + ViT(表情)
// wasm 后端纯 JS 运行,模型走 npm 包内自带的 models/,全程本地不出机器。
// 用法:
//   node scripts/sense-face.mjs            # 抓一帧,输出一行 JSON
//   node scripts/sense-face.mjs enroll     # 录入主人:连拍 8 帧,平均人脸向量存 scripts/master.json
//   node scripts/sense-face.mjs --save x.jpg  # 只抓帧存图(调试)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import jpeg from 'jpeg-js';

const ROOT = path.dirname(url.fileURLToPath(import.meta.url)) + '/..';
const MASTER_FILE = path.join(ROOT, 'scripts', 'master.json');
const MODELS = path.join(ROOT, 'node_modules', '@vladmandic', 'human', 'models') + path.sep;
const WASM = path.join(ROOT, 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist') + path.sep;
const CAMERA = 'FHD Camera';

function grabFrame(out) {
  const seq = out.replace(/\.jpg$/, '') + '%02d.jpg';
  let ffErr = '';
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'dshow',
      '-rtbufsize', '100M', '-i', 'video=' + CAMERA, '-frames:v', '8', '-y', seq],
      { timeout: 30000, stdio: 'pipe' });
  } catch (e) { ffErr = ((e.stderr || '') + ' ' + (e.message || '')).toString().slice(-300); }
  const dir = path.dirname(out), base = path.basename(out, '.jpg');
  let frames = [];
  try { frames = fs.readdirSync(dir).filter(f => f.startsWith(base) && /^\d+\.jpg$/.test(f.slice(base.length))).sort(); } catch { }
  if (!frames.length) return { ok: false, ffErr, killErr };
  const last = frames[frames.length - 1];
  for (const f of frames) { if (f !== last) { try { fs.unlinkSync(path.join(dir, f)); } catch { } } }
  if (last !== base + '.jpg') fs.renameSync(path.join(dir, last), out);
  return { ok: fs.existsSync(out) && fs.statSync(out).size > 1000 };
}

function luminance(file) {
  const img = jpeg.decode(fs.readFileSync(file), { useTArray: true, maxMemoryUsageInMB: 512 });
  let sum = 0, n = 0;
  for (let j = 0; j < img.data.length; j += 40) { // 抽样 1/10 像素
    sum += 0.299 * img.data[j] + 0.587 * img.data[j + 1] + 0.114 * img.data[j + 2];
    n++;
  }
  return sum / n; // 0-255
}

function decodeJpeg(file) {
  const buf = fs.readFileSync(file);
  const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 }); // RGBA
  return { data: img.data, width: img.width, height: img.height };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * a[i] * 0 + a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

const argv = process.argv.slice(2);
const tmp = path.join(ROOT, 'scripts', '.frame.jpg');

if (argv[0] === '--save') {
  console.log(grabFrame(argv[1] || 'face-test.jpg') ? 'saved' : 'capture failed');
  process.exit(0);
}
if (argv[0] === '--image') {
  fs.copyFileSync(argv[1], tmp); // 调试:分析指定图片,不抓摄像头
} else if (!grabFrame(tmp).ok) { console.log(JSON.stringify({ face: 'camera_unavailable' })); process.exit(0); }

const humanMod = await import(url.pathToFileURL(path.join(ROOT, 'node_modules', '@vladmandic', 'human', 'dist', 'human.node-wasm.js')));
// 本 node 的 fetch 不支持 file: scheme → 打补丁:file: 走 fs
const _fetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (u, o) => {
  if (typeof u === 'string' && u.startsWith('file:')) {
    const buf = fs.readFileSync(url.fileURLToPath(u));
    return new Response(buf, { status: 200 });
  }
  return _fetch(u, o);
};
const Human = humanMod.Human;
const human = new Human({
  backend: 'wasm', wasmPath: WASM, modelBasePath: url.pathToFileURL(MODELS).href + '/',
  debug: false,
  face: { enabled: true, detector: { enabled: true, rotation: false }, mesh: { enabled: true }, iris: { enabled: true }, description: { enabled: true }, emotion: { enabled: false } },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: true },
});
await human.load();

// 纯 JS 解码:RGBA → RGB tensor(wasm 后端没有 tf.node.decodeImage)
function toTensor(file) {
  const img = decodeJpeg(file);
  const rgb = new Uint8Array(img.width * img.height * 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { rgb[i] = img.data[j]; rgb[i + 1] = img.data[j + 1]; rgb[i + 2] = img.data[j + 2]; }
  return human.tf.tensor3d(rgb, [img.height, img.width, 3], 'int32');
}

async function detectFrame() {
  const tensor = toTensor(tmp);
  const res = await human.detect(tensor);
  human.tf.dispose(tensor);
  return res;
}

if (argv[0] === 'enroll') {
  const embs = [];
  for (let n = 0; n < 8; n++) {
    if (n > 0) await new Promise(r => setTimeout(r, 800));
    if (!grabFrame(tmp).ok) continue;
    const res = await detectFrame();
    const f = res.face.find(x => x.embedding?.length);
    if (f) embs.push(f.embedding);
    console.error(`frame ${n + 1}: ${f ? 'face ok' : 'no face'}`);
  }
  if (embs.length < 3) { console.log(JSON.stringify({ enroll: 'failed_too_few_faces', got: embs.length })); process.exit(1); }
  const avg = embs[0].map((_, i) => embs.reduce((s, e) => s + e[i], 0) / embs.length);
  fs.writeFileSync(MASTER_FILE, JSON.stringify({ dim: avg.length, samples: embs.length, embedding: avg }));
  console.log(JSON.stringify({ enroll: 'ok', samples: embs.length }));
  process.exit(0);
}

// ---- 常规探头 ----
const res = await detectFrame();
const lum = +luminance(tmp).toFixed(1);
if (lum < 20) { console.log(JSON.stringify({ face: 'too_dark', lum, hint: '主人在电脑前但环境漆黑,摄像头看不清' })); process.exit(0); }
const face = res.face.find(x => x.embedding?.length) || res.face[0];
if (!face) { console.log(JSON.stringify({ face: 'none', lum })); process.exit(0); }
const out = { faces: res.face.length, lum };
if (fs.existsSync(MASTER_FILE) && face.embedding) {
  const m = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
  out.master = +cosine(m.embedding, face.embedding).toFixed(3);
  out.isMaster = out.master > 0.55;
} else { out.isMaster = null; }
// human 自带表情(FER 系)作为速算参考
if (face.emotion?.length) out.humanEmotion = face.emotion[0].emotion + ' ' + face.emotion[0].score.toFixed(2);
if (face.gaze) out.gaze = face.gaze.bearing;
if (res.gesture?.length) out.gestures = res.gesture.map(g => Object.values(g)[1]).slice(0, 3);

console.log(JSON.stringify(out));

// 表情精算:裁脸区域送 Xenova ViT( transformers.js,首次运行下载模型后本地缓存)
if (process.env.FACE_FINE !== '0' && face.box) {
  try {
    const { pipeline, RawImage, env } = await import('@huggingface/transformers');
    env.remoteHost = process.env.HF_MIRROR || 'https://hf-mirror.com'; // 国内镜像,首次下载后进本地缓存
    const clf = await pipeline('image-classification', 'Xenova/facial_emotions_image_detection', { dtype: 'q8' });
    const img = await RawImage.read(tmp);
    const { width: W, height: H } = img;
    // human 实测 box 是像素数组 [x, y, w, h]
    const [bx, by, bw, bh] = face.box;
    const x = Math.max(0, bx - Math.round(bw * 0.15)), y = Math.max(0, by - Math.round(bh * 0.15)); // 外扩 15% 带点背景
    const w = Math.min(W - x, Math.round(bw * 1.3)), h = Math.min(H - y, Math.round(bh * 1.3));
    const cropFile = tmp.replace('.jpg', '.crop.jpg');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-vf', `crop=${w}:${h}:${x}:${y}`, cropFile], { timeout: 15000 });
    const pred = await clf(await RawImage.read(cropFile), { top_k: 3 });
    out.emotion = pred.map(p => `${p.label} ${(+p.score).toFixed(2)}`).join(', ');
  } catch (e) { out.emotion = 'error: ' + e.message.split('\n')[0]; }
  console.log(JSON.stringify(out));
}
