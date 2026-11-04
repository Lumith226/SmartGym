---
library_name: pytorch
license: apache-2.0
tags:
- android
pipeline_tag: keypoint-detection

---

![](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/litehrnet/web-assets/model_demo.png)

# LiteHRNet: Optimized for Qualcomm Devices

LiteHRNet is a machine learning model that detects human pose and returns a location and confidence for each of 17 joints.

This is based on the implementation of LiteHRNet found [here](https://github.com/HRNet/Lite-HRNet).
This repository contains pre-exported model files optimized for Qualcomm® devices. You can use the [Qualcomm® AI Hub Models](https://github.com/qualcomm/ai-hub-models/blob/v0.65.0/src/qai_hub_models/models/litehrnet) library to export with custom configurations. More details on model performance across various devices, can be found [here](#performance-summary).

Qualcomm AI Hub Models uses [Qualcomm AI Hub Workbench](https://workbench.aihub.qualcomm.com) to compile, profile, and evaluate this model. [Sign up](https://myaccount.qualcomm.com/signup) to run these models on a hosted Qualcomm® device.

## Getting Started
There are two ways to deploy this model on your device:

### Option 1: Download Pre-Exported Models

Below are pre-exported model assets ready for deployment.

| Runtime | Precision | Chipset | SDK Versions | Download |
|---|---|---|---|---|
| ONNX | float | Universal | QAIRT 2.50, ONNX Runtime 1.30.0 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/litehrnet/releases/v0.65.0/litehrnet-onnx-float.zip)
| QNN_DLC | float | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/litehrnet/releases/v0.65.0/litehrnet-qnn_dlc-float.zip)
| TFLITE | float | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/litehrnet/releases/v0.65.0/litehrnet-tflite-float.zip)

For more device-specific assets and performance metrics, visit **[LiteHRNet on Qualcomm® AI Hub](https://aihub.qualcomm.com/models/litehrnet)**.


### Option 2: Export with Custom Configurations

Use the [Qualcomm® AI Hub Models](https://github.com/qualcomm/ai-hub-models/blob/v0.65.0/src/qai_hub_models/models/litehrnet) Python library to compile and export the model with your own:
- Custom weights (e.g., fine-tuned checkpoints)
- Custom input shapes
- Target device and runtime configurations

This option is ideal if you need to customize the model beyond the default configuration provided here.

See our repository for [LiteHRNet on GitHub](https://github.com/qualcomm/ai-hub-models/blob/v0.65.0/src/qai_hub_models/models/litehrnet) for usage instructions.

## Model Details

**Model Type:** Model_use_case.pose_estimation

**Model Stats:**
- Input resolution: 256x192
- Model size (float): 4.49 MB
- Number of parameters: 1.11M

## Performance Summary
| Model | Runtime | Precision | Chipset | Inference Time (ms) | Peak Memory Range (MB) | Primary Compute Unit
|---|---|---|---|---|---|---
| LiteHRNet | ONNX | float | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 2.315 ms | 1 - 102 MB | NPU
| LiteHRNet | ONNX | float | Snapdragon® 8 Elite For Galaxy Mobile | 2.559 ms | 0 - 100 MB | NPU
| LiteHRNet | ONNX | float | Snapdragon® X2 Elite | 2.412 ms | 2 - 2 MB | NPU
| LiteHRNet | ONNX | float | Snapdragon® X Elite | 5.085 ms | 5 - 5 MB | NPU
| LiteHRNet | ONNX | float | Snapdragon® 8 Gen 3 Mobile | 2.986 ms | 0 - 125 MB | NPU
| LiteHRNet | ONNX | float | Snapdragon® 8 Gen 1 Mobile | 5.948 ms | 1 - 122 MB | NPU
| LiteHRNet | ONNX | float | Qualcomm® Dragonwing™ IQ-8275 | 4.347 ms | 1 - 5 MB | NPU
| LiteHRNet | ONNX | float | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 4.81 ms | 0 - 8 MB | NPU
| LiteHRNet | ONNX | float | Qualcomm® QCS8450 | 5.948 ms | 1 - 122 MB | NPU
| LiteHRNet | ONNX | float | Qualcomm® Dragonwing™ IQ-9075 | 5.2 ms | 1 - 4 MB | NPU
| LiteHRNet | ONNX | float | Qualcomm® Dragonwing™ IQ-X7181 | 5.085 ms | 5 - 5 MB | NPU
| LiteHRNet | ONNX | float | Qualcomm® Dragonwing™ Q-8750 | 2.559 ms | 0 - 100 MB | NPU
| LiteHRNet | QNN_DLC | float | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 0.908 ms | 1 - 85 MB | NPU
| LiteHRNet | QNN_DLC | float | Snapdragon® 8 Elite For Galaxy Mobile | 1.074 ms | 0 - 78 MB | NPU
| LiteHRNet | QNN_DLC | float | Snapdragon® X2 Elite | 1.31 ms | 1 - 1 MB | NPU
| LiteHRNet | QNN_DLC | float | Snapdragon® X Elite | 2.41 ms | 1 - 1 MB | NPU
| LiteHRNet | QNN_DLC | float | Snapdragon® 8 Gen 3 Mobile | 1.395 ms | 0 - 100 MB | NPU
| LiteHRNet | QNN_DLC | float | Snapdragon® 8 Gen 1 Mobile | 2.911 ms | 0 - 100 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® Dragonwing™ IQ-8275 | 2.181 ms | 1 - 4 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 2.091 ms | 1 - 2 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® SA8775P | 2.68 ms | 1 - 79 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® SA8650P | 2.68 ms | 1 - 79 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® SA8255P | 2.68 ms | 1 - 79 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® QCS8450 | 2.911 ms | 0 - 100 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® Dragonwing™ IQ-9075 | 2.476 ms | 1 - 3 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® Dragonwing™ IQ-X7181 | 2.41 ms | 1 - 1 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® Dragonwing™ Q-8750 | 1.074 ms | 0 - 78 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® SA7255P | 4.981 ms | 1 - 78 MB | NPU
| LiteHRNet | QNN_DLC | float | Qualcomm® SA8295P | 3.348 ms | 0 - 76 MB | NPU
| LiteHRNet | TFLITE | float | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 2.049 ms | 0 - 109 MB | NPU
| LiteHRNet | TFLITE | float | Snapdragon® 8 Elite For Galaxy Mobile | 2.225 ms | 0 - 106 MB | NPU
| LiteHRNet | TFLITE | float | Snapdragon® 8 Gen 3 Mobile | 2.673 ms | 0 - 146 MB | NPU
| LiteHRNet | TFLITE | float | Snapdragon® 8 Gen 1 Mobile | 5.224 ms | 0 - 135 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® Dragonwing™ IQ-8275 | 4.198 ms | 1 - 12 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 4.255 ms | 1 - 5 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® SA8775P | 5.247 ms | 1 - 112 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® SA8650P | 5.247 ms | 1 - 112 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® SA8255P | 5.247 ms | 1 - 112 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® QCS8450 | 5.224 ms | 0 - 135 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® Dragonwing™ IQ-9075 | 4.91 ms | 1 - 12 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® Dragonwing™ Q-8750 | 2.225 ms | 0 - 106 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® SA7255P | 8.564 ms | 1 - 110 MB | NPU
| LiteHRNet | TFLITE | float | Qualcomm® SA8295P | 6.011 ms | 1 - 111 MB | NPU

## License
* The license for the original implementation of LiteHRNet can be found
  [here](https://github.com/HRNet/Lite-HRNet/blob/hrnet/LICENSE).

## References
* [Lite-HRNet: A Lightweight High-Resolution Network](https://arxiv.org/abs/2104.06403)
* [Source Model Implementation](https://github.com/HRNet/Lite-HRNet)

## Community
* Join [our AI Hub Slack community](https://aihub.qualcomm.com/community/slack) to collaborate, post questions and learn more about on-device AI.
* For questions or feedback please [reach out to us](mailto:ai-hub-support@qti.qualcomm.com).
