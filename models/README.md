# models/ — 耳朵与测试模型(不入库,太大)

GitHub 单文件上限 100MB,模型不入库。换机重建:经 hf-mirror 下载后放到对应目录即可。

## streaming-zipformer-zh-int8-2025-06-30(当前耳朵用的中文模型,~160MB)

目录 `sherpa-onnx-streaming-zipformer-zh-2025-06-30/`,需 4 个文件:
`encoder.int8.onnx`(153.7MB)、`decoder.onnx`(4.9MB)、`joiner.int8.onnx`(1MB)、`tokens.txt`

```powershell
$dst = "models\sherpa-onnx-streaming-zipformer-zh-2025-06-30"
$base = "https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30/resolve/main"
mkdir $dst -Force
"encoder.int8.onnx","decoder.onnx","joiner.int8.onnx","tokens.txt" | % {
  Invoke-WebRequest "$base/$_" -OutFile "$dst\$_" }
```

## silero VAD(2.22MB)

`silero-vad/silero_vad.onnx` ← `https://hf-mirror.com/deepghs/silero-vad-onnx/resolve/main/silero_vad.onnx`

## 双语 2023-02-20(已弃用:中文叠字毛病,留作对照)

`sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-16/` ←
`https://hf-mirror.com/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20` 的
encoder/decoder/joiner int8 + tokens.txt(目录名 -02-16,内容是 -02-20 仓)。

## ear-test.wav(1.8MB)

女仆 TTS 合成的离线转写测试样音,可随时用 `speak.ps1 -OutFile models\ear-test.wav -NoPlay` 重造。
