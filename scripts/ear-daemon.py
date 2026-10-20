# ear-daemon.py · 女仆的耳朵(常驻):麦克风(共享) -> silero VAD 切段 -> 流式转写 -> ear.log(环形)
# 架构:silero VAD(2MB,只判有没有人声)负责句子边界;zipformer 转写只在有人声时干活。
# 真相写进 %TEMP%\anima-ear\ear.log,一行一条 JSON:{"ts":..., "text":...}
# 用法: ear-env\Scripts\python.exe ear-daemon.py [--device <设备序号>] [--print]
#       模型可用环境变量覆盖:EAR_MODEL_DIR / EAR_ENCODER / EAR_DECODER / EAR_JOINER / EAR_VAD
import argparse
import collections
import os
import json
import pathlib
import queue
import time

import numpy as np
import sounddevice as sd
import sherpa_onnx
from sherpa_onnx.online_recognizer import OnlineRecognizer

MODEL_DIR = pathlib.Path(os.environ.get(
    "EAR_MODEL_DIR",
    r"C:\Users\Dao\Code\dao1023\anima\models"
    r"\sherpa-onnx-streaming-zipformer-zh-2025-06-30",
))
ENCODER = os.environ.get("EAR_ENCODER", "encoder.int8.onnx")
DECODER = os.environ.get("EAR_DECODER", "decoder.onnx")
JOINER = os.environ.get("EAR_JOINER", "joiner.int8.onnx")
VAD_PATH = pathlib.Path(os.environ.get(
    "EAR_VAD", r"C:\Users\Dao\Code\dao1023\anima\models\silero-vad\silero_vad.onnx",
))
LOG = pathlib.Path(r"C:\Users\Dao\AppData\Local\Temp\anima-ear\ear.log")
SAMPLE_RATE = 16000

VAD_THRESHOLD = 0.5        # silero 人声概率门槛
SILENCE_CLOSE = int(0.8 * SAMPLE_RATE)   # 静音 0.8s 断句(说一半的气口不会断)
MIN_SPEECH = int(0.25 * SAMPLE_RATE)     # 短于 0.25s 的"声音"整段丢弃(碰撞/咳嗽不算话)
MAX_SEG = int(30 * SAMPLE_RATE)          # 单段最长 30s,强制落账防呆
PRE_BUFFER = int(0.3 * SAMPLE_RATE)      # 起音前 0.3s 回捞,防咬头
_min_chars = 2             # 少于 2 个字符的尾句不落账


def build_recognizer() -> OnlineRecognizer:
    return OnlineRecognizer.from_transducer(
        tokens=str(MODEL_DIR / "tokens.txt"),
        encoder=str(MODEL_DIR / ENCODER),
        decoder=str(MODEL_DIR / DECODER),
        joiner=str(MODEL_DIR / JOINER),
        num_threads=2,
        sample_rate=SAMPLE_RATE,
        feature_dim=80,
        decoding_method="modified_beam_search",
        provider="cpu",
    )


def build_vad() -> sherpa_onnx.VadModel:
    cfg = sherpa_onnx.VadModelConfig()
    cfg.silero_vad.model = str(VAD_PATH)
    cfg.silero_vad.threshold = VAD_THRESHOLD
    cfg.sample_rate = SAMPLE_RATE
    return sherpa_onnx.VadModel.create(cfg)


def append_log(text: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(
        {"ts": time.strftime("%Y-%m-%d %H:%M:%S"), "text": text},
        ensure_ascii=False,
    )
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    if LOG.stat().st_size > 300_000:  # ~300KB 封顶,留最后 200 行
        lines = LOG.read_text(encoding="utf-8").splitlines()
        LOG.write_text("\n".join(lines[-200:]) + "\n", encoding="utf-8")


def decode_block(rec, stream, wav: np.ndarray) -> str:
    """把一段完整语音喂进流式识别器,返回整句文本。"""
    for i in range(0, len(wav), SAMPLE_RATE // 10):
        stream.accept_waveform(SAMPLE_RATE, wav[i : i + SAMPLE_RATE // 10])
        while rec.is_ready(stream):
            rec.decode_stream(stream)
    # 补 0.6s 静音逼出尾字
    stream.accept_waveform(SAMPLE_RATE, np.zeros(int(0.6 * SAMPLE_RATE), dtype=np.float32))
    while rec.is_ready(stream):
        rec.decode_stream(stream)
    return rec.get_result(stream).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", type=int, default=None)
    parser.add_argument("--name", default="智音",  # 按名字找麦克风(优先 WASAPI),防设备序号漂移
                        help="输入设备名包含此子串即选中")
    parser.add_argument("--print", action="store_true")
    args = parser.parse_args()

    if args.device is None:
        cands = [d for d in sd.query_devices()
                 if d["max_input_channels"] > 0 and args.name in d["name"]]
        wasapi = [d for d in cands if sd.query_hostapis(d["hostapi"])["name"].startswith("Windows WASAPI")]
        pick = (wasapi or cands)
        if not pick:
            raise SystemExit(f"[ear] no input device matching name={args.name!r}")
        args.device = pick[0]["index"]
        if args.print:
            print(f"[ear] matched device {args.device}: {pick[0]['name']}", flush=True)

    rec = build_recognizer()
    vad = build_vad()
    window = vad.window_size() if callable(getattr(vad, "window_size")) else getattr(vad, "window_size", 512)
    print(f"[ear] model={MODEL_DIR.name} vad={VAD_PATH.name} "
          f"silence_close={SILENCE_CLOSE/SAMPLE_RATE:.1f}s", flush=True)

    q: "queue.Queue[np.ndarray]" = queue.Queue()

    # WASAPI 设备往往只收 48kHz:先试 16k,失败退 48k 并按整数倍降采样
    capture_rate = SAMPLE_RATE
    decim = 1
    try:
        sd.check_input_settings(device=args.device, samplerate=SAMPLE_RATE, channels=1)
    except Exception:
        capture_rate = 48000
        decim = capture_rate // SAMPLE_RATE
        sd.check_input_settings(device=args.device, samplerate=capture_rate, channels=1)
        print(f"[ear] device rejects {SAMPLE_RATE}Hz -> capture {capture_rate}Hz, decimate x{decim}", flush=True)

    def callback(indata, frames, time_info, status):
        wav = indata[:, 0].astype(np.float32) / 32768.0
        if decim > 1:
            n = (len(wav) // decim) * decim
            wav = wav[:n].reshape(-1, decim).mean(axis=1)
        q.put(wav)

    pre: collections.deque = collections.deque(maxlen=PRE_BUFFER // window + 2)
    buf = []                 # 当前段的样本
    speech_samples = 0       # 段内 VAD 判为语音的样本数
    silence_run = 0          # 连续静音样本数
    prev_tail = None         # 尾窗(VAD 要窗口对齐,留半窗拼接)
    tail = None

    with sd.InputStream(
        samplerate=capture_rate,
        blocksize=1600 * decim,   # 100ms 一块
        dtype="int16",
        channels=1,
        device=args.device,
        callback=callback,
    ):
        print(f"[ear] listening on device={args.device if args.device is not None else 'default'}, log={LOG}", flush=True)
        while True:
            wav = q.get()
            if pathlib.Path(LOG.parent / "PAUSED").exists():
                continue  # 女仆叫停耳朵:只扔不记
            if prev_tail is not None:
                wav = np.concatenate([prev_tail, wav])
            # 按 VAD 窗口切,余数留作下一轮的尾巴
            n_win = len(wav) // window
            prev_tail = wav[n_win * window:]
            for i in range(n_win):
                frame = wav[i * window : (i + 1) * window]
                is_speech = vad.is_speech(frame)
                if is_speech:
                    if not buf:
                        buf.extend(pre)          # 回捞起音前 0.3s
                    buf.append(frame)
                    speech_samples += window
                    silence_run = 0
                elif buf:
                    buf.append(frame)
                    silence_run += window
                    close = silence_run >= SILENCE_CLOSE or len(buf) >= MAX_SEG
                    if close:
                        if speech_samples >= MIN_SPEECH:
                            text = decode_block(rec, rec.create_stream(), np.concatenate(buf))
                            if len(text) >= _min_chars:
                                append_log(text)
                                if args.print:
                                    print(f"[ear] ✓ {text}", flush=True)
                        buf = []
                        speech_samples = silence_run = 0
                else:
                    pre.append(frame)
            time.sleep(0.01)


if __name__ == "__main__":
    main()
