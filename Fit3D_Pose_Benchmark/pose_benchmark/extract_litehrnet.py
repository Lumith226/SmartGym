"""Extract unchanged pretrained neural core from the Qualcomm I/O wrapper.

The wrapper contains GatherND and heatmap decoding. Keeping just the core
allows DirectML inference; image normalization and decoding stay on the host.
"""
from pathlib import Path
import json,onnx
BASE=Path(__file__).resolve().parent
W=BASE/'weights'
m=onnx.load(W/'litehrnet.onnx')
m=onnx.shape_inference.infer_shapes(m)
core=onnx.utils.Extractor(m).extract_model(['div'],['heatmaps'])
onnx.save(core,W/'litehrnet_core.onnx')
(BASE/'litehrnet_conversion.json').write_text(json.dumps({'source':'litehrnet.onnx','input':'div','output':'heatmaps','learned_weights_changed':False,'normalization':'RGB, (image-mean)/std in 0..255 units; standard MMPose input','reason':'exclude wrapper GatherND/argmax operations from GPU graph'},indent=2))
print('Saved Lite-HRNet core', (W/'litehrnet_core.onnx').stat().st_size)
