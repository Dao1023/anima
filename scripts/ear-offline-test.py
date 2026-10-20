# ear-offline-test.py · 离线听写一个 wav,验证耳朵的模型层(不经麦克风)
# 用法: ear-env\Scripts\python.exe ear-offline-test.py <wav路径>
import sys
import pathlib
import wave
import importlib.util
import numpy as np

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("ear_daemon", HERE / "ear-daemon.py")
ear = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ear)

SAMPLE_RATE = ear.SAMPLE_RATE

wav_path = sys.argv[1]
with wave.open(wav_path, "rb") as w:
    sr = w.getframerate()
    ch = w.getnchannels()
    sw = w.getsampwidth()
    raw = w.readframes(w.getnframes())
assert sw == 2, f"expect 16-bit pcm, got {sw*8}bit"
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
if ch > 1:
    x = x[::ch]
if sr != SAMPLE_RATE:
    n = int(len(x) * SAMPLE_RATE / sr)
    x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
print(f"[input] {sr}Hz {ch}ch {len(x)/SAMPLE_RATE:.1f}s -> {SAMPLE_RATE}Hz")

rec = ear.build_recognizer()
s = rec.create_stream()
for i in range(0, len(x), SAMPLE_RATE // 10):
    s.accept_waveform(SAMPLE_RATE, x[i : i + SAMPLE_RATE // 10])
    while rec.is_ready(s):
        rec.decode_stream(s)
tail = rec.get_result(s).strip()
# 补 1s 静音逼出尾字
s.accept_waveform(SAMPLE_RATE, np.zeros(SAMPLE_RATE, dtype=np.float32))
while rec.is_ready(s):
    rec.decode_stream(s)
final = rec.get_result(s).strip()
print("tail :", tail)
print("final:", final)
