---
library_name: pytorch
license: mit
tags:
- bu_auto
- android
pipeline_tag: keypoint-detection

---

![](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/web-assets/model_demo.png)

# HRNetPose: Optimized for Qualcomm Devices

HRNet performs pose estimation in high-resolution representations.

This is based on the implementation of HRNetPose found [here](https://github.com/leoxiaobin/deep-high-resolution-net.pytorch).
This repository contains pre-exported model files optimized for Qualcomm® devices. You can use the [Qualcomm® AI Hub Models](https://github.com/qualcomm/ai-hub-models/blob/v0.65.0/src/qai_hub_models/models/hrnet_pose) library to export with custom configurations. More details on model performance across various devices, can be found [here](#performance-summary).

Qualcomm AI Hub Models uses [Qualcomm AI Hub Workbench](https://workbench.aihub.qualcomm.com) to compile, profile, and evaluate this model. [Sign up](https://myaccount.qualcomm.com/signup) to run these models on a hosted Qualcomm® device.

## Getting Started
There are two ways to deploy this model on your device:

### Option 1: Download Pre-Exported Models

Below are pre-exported model assets ready for deployment.

| Runtime | Precision | Chipset | SDK Versions | Download |
|---|---|---|---|---|
| ONNX | float | Universal | QAIRT 2.50, ONNX Runtime 1.27.1 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-onnx-float.zip)
| ONNX | w8a16 | Universal | QAIRT 2.50, ONNX Runtime 1.27.1 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-onnx-w8a16.zip)
| ONNX | w8a8 | Universal | QAIRT 2.50, ONNX Runtime 1.27.1 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-onnx-w8a8.zip)
| QNN_DLC | float | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-qnn_dlc-float.zip)
| QNN_DLC | w8a16 | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-qnn_dlc-w8a16.zip)
| QNN_DLC | w8a8 | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-qnn_dlc-w8a8.zip)
| TFLITE | float | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-tflite-float.zip)
| TFLITE | w8a8 | Universal | QAIRT 2.50 | [Download](https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/hrnet_pose/releases/v0.65.0/hrnet_pose-tflite-w8a8.zip)

For more device-specific assets and performance metrics, visit **[HRNetPose on Qualcomm® AI Hub](https://aihub.qualcomm.com/models/hrnet_pose)**.


### Option 2: Export with Custom Configurations

Use the [Qualcomm® AI Hub Models](https://github.com/qualcomm/ai-hub-models/blob/v0.65.0/src/qai_hub_models/models/hrnet_pose) Python library to compile and export the model with your own:
- Custom weights (e.g., fine-tuned checkpoints)
- Custom input shapes
- Target device and runtime configurations

This option is ideal if you need to customize the model beyond the default configuration provided here.

See our repository for [HRNetPose on GitHub](https://github.com/qualcomm/ai-hub-models/blob/v0.65.0/src/qai_hub_models/models/hrnet_pose) for usage instructions.

## Model Details

**Model Type:** Model_use_case.pose_estimation

**Model Stats:**
- Input resolution: 256x192
- Model checkpoint: hrnet_posenet_FP32_state_dict
- Model size (float): 109 MB
- Model size (w8a8): 28.1 MB
- Number of parameters: 28.5M

## Performance Summary
| Model | Runtime | Precision | Chipset | Inference Time (ms) | Peak Memory Range (MB) | Primary Compute Unit
|---|---|---|---|---|---|---
| HRNetPose | ONNX | float | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 1.265 ms | 1 - 93 MB | NPU
| HRNetPose | ONNX | float | Snapdragon® 8 Elite For Galaxy Mobile | 1.456 ms | 0 - 91 MB | NPU
| HRNetPose | ONNX | float | Snapdragon® X2 Elite | 1.282 ms | 2 - 2 MB | NPU
| HRNetPose | ONNX | float | Snapdragon® X Elite | 2.373 ms | 56 - 56 MB | NPU
| HRNetPose | ONNX | float | Snapdragon® 8 Gen 3 Mobile | 1.807 ms | 0 - 144 MB | NPU
| HRNetPose | ONNX | float | Snapdragon® 8 Gen 1 Mobile | 3.734 ms | 1 - 134 MB | NPU
| HRNetPose | ONNX | float | Qualcomm® Dragonwing™ IQ-8275 | 4.324 ms | 0 - 5 MB | NPU
| HRNetPose | ONNX | float | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 2.375 ms | 0 - 58 MB | NPU
| HRNetPose | ONNX | float | Qualcomm® QCS8450 | 3.734 ms | 1 - 134 MB | NPU
| HRNetPose | ONNX | float | Qualcomm® Dragonwing™ IQ-9075 | 3.871 ms | 0 - 4 MB | NPU
| HRNetPose | ONNX | float | Qualcomm® Dragonwing™ IQ-X7181 | 2.373 ms | 56 - 56 MB | NPU
| HRNetPose | ONNX | float | Qualcomm® Dragonwing™ Q-8750 | 1.456 ms | 0 - 91 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 0.819 ms | 0 - 140 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® 8 Elite For Galaxy Mobile | 0.956 ms | 0 - 137 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® X2 Elite | 1.008 ms | 1 - 1 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® X Elite | 1.714 ms | 28 - 28 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® 8 Gen 3 Mobile | 1.229 ms | 0 - 203 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® 8 Gen 1 Mobile | 2.175 ms | 0 - 206 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ QCS6490 | 6.459 ms | 0 - 4 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ IQ-8275 | 1.942 ms | 0 - 4 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 1.713 ms | 0 - 35 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® QCS8450 | 2.175 ms | 0 - 206 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ IQ-9075 | 1.896 ms | 0 - 4 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ IQ-X7181 | 1.714 ms | 28 - 28 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ Q-6690 | 22.571 ms | 0 - 243 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ Q-7790 | 2.34 ms | 0 - 143 MB | NPU
| HRNetPose | ONNX | w8a16 | Qualcomm® Dragonwing™ Q-8750 | 0.956 ms | 0 - 137 MB | NPU
| HRNetPose | ONNX | w8a16 | Snapdragon® 7 Gen 4 Mobile | 2.34 ms | 0 - 143 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 0.645 ms | 0 - 130 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® 8 Elite For Galaxy Mobile | 0.703 ms | 0 - 126 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® X2 Elite | 0.539 ms | 1 - 1 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® X Elite | 1.066 ms | 28 - 28 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® 8 Gen 3 Mobile | 0.848 ms | 0 - 190 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® 8 Gen 1 Mobile | 1.408 ms | 0 - 192 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ QCS6490 | 3.438 ms | 0 - 4 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ IQ-8275 | 1.358 ms | 0 - 4 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 1.14 ms | 0 - 129 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® QCS8450 | 1.408 ms | 0 - 192 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ IQ-9075 | 1.364 ms | 0 - 3 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ IQ-X7181 | 1.066 ms | 28 - 28 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ Q-6690 | 9.998 ms | 0 - 237 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ Q-7790 | 1.434 ms | 0 - 127 MB | NPU
| HRNetPose | ONNX | w8a8 | Qualcomm® Dragonwing™ Q-8750 | 0.703 ms | 0 - 126 MB | NPU
| HRNetPose | ONNX | w8a8 | Snapdragon® 7 Gen 4 Mobile | 1.434 ms | 0 - 127 MB | NPU
| HRNetPose | QNN_DLC | float | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 1.341 ms | 1 - 77 MB | NPU
| HRNetPose | QNN_DLC | float | Snapdragon® 8 Elite For Galaxy Mobile | 1.534 ms | 0 - 74 MB | NPU
| HRNetPose | QNN_DLC | float | Snapdragon® X2 Elite | 1.622 ms | 1 - 1 MB | NPU
| HRNetPose | QNN_DLC | float | Snapdragon® X Elite | 2.893 ms | 1 - 1 MB | NPU
| HRNetPose | QNN_DLC | float | Snapdragon® 8 Gen 3 Mobile | 2.002 ms | 0 - 118 MB | NPU
| HRNetPose | QNN_DLC | float | Snapdragon® 8 Gen 1 Mobile | 4.4 ms | 0 - 105 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® Dragonwing™ IQ-8275 | 4.358 ms | 1 - 4 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 2.689 ms | 1 - 123 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® QCS8450 | 4.4 ms | 0 - 105 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® Dragonwing™ IQ-9075 | 4.022 ms | 1 - 4 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® Dragonwing™ IQ-X7181 | 2.893 ms | 1 - 1 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® Dragonwing™ Q-8750 | 1.534 ms | 0 - 74 MB | NPU
| HRNetPose | QNN_DLC | float | Qualcomm® SA8295P | 4.461 ms | 0 - 60 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 0.838 ms | 0 - 108 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® 8 Elite For Galaxy Mobile | 1.036 ms | 0 - 108 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® X2 Elite | 1.339 ms | 0 - 0 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® X Elite | 2.168 ms | 0 - 0 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® 8 Gen 3 Mobile | 1.392 ms | 0 - 153 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® 8 Gen 1 Mobile | 2.411 ms | 0 - 154 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ QCS6490 | 7.062 ms | 0 - 3 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ IQ-8275 | 2.082 ms | 0 - 4 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 1.877 ms | 0 - 104 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® SA8775P | 2.207 ms | 0 - 106 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® SA8650P | 2.207 ms | 0 - 106 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® SA8255P | 2.207 ms | 0 - 106 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® QCS8450 | 2.411 ms | 0 - 154 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ IQ-9075 | 2.065 ms | 2 - 5 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ IQ-X7181 | 2.168 ms | 0 - 0 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ Q-6690 | 19.972 ms | 0 - 211 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ Q-7790 | 2.51 ms | 0 - 104 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® Dragonwing™ Q-8750 | 1.036 ms | 0 - 108 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Qualcomm® SA8295P | 2.94 ms | 0 - 102 MB | NPU
| HRNetPose | QNN_DLC | w8a16 | Snapdragon® 7 Gen 4 Mobile | 2.51 ms | 0 - 104 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 0.577 ms | 0 - 97 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® 8 Elite For Galaxy Mobile | 0.617 ms | 0 - 98 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® X2 Elite | 0.663 ms | 0 - 0 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® X Elite | 1.254 ms | 0 - 0 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® 8 Gen 3 Mobile | 0.819 ms | 0 - 140 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® 8 Gen 1 Mobile | 1.413 ms | 0 - 142 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ QCS6490 | 3.755 ms | 2 - 4 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ IQ-8275 | 1.289 ms | 0 - 3 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 1.114 ms | 0 - 2 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® QCS8450 | 1.413 ms | 0 - 142 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ IQ-9075 | 1.319 ms | 0 - 2 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ IQ-X7181 | 1.254 ms | 0 - 0 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ Q-6690 | 10.637 ms | 0 - 207 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ Q-7790 | 1.49 ms | 0 - 94 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® Dragonwing™ Q-8750 | 0.617 ms | 0 - 98 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Qualcomm® SA8295P | 1.811 ms | 0 - 93 MB | NPU
| HRNetPose | QNN_DLC | w8a8 | Snapdragon® 7 Gen 4 Mobile | 1.49 ms | 0 - 94 MB | NPU
| HRNetPose | TFLITE | float | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 1.351 ms | 0 - 119 MB | NPU
| HRNetPose | TFLITE | float | Snapdragon® 8 Elite For Galaxy Mobile | 1.567 ms | 0 - 108 MB | NPU
| HRNetPose | TFLITE | float | Snapdragon® 8 Gen 3 Mobile | 1.979 ms | 0 - 187 MB | NPU
| HRNetPose | TFLITE | float | Snapdragon® 8 Gen 1 Mobile | 4.396 ms | 0 - 175 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® Dragonwing™ IQ-8275 | 4.38 ms | 0 - 59 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 2.67 ms | 0 - 91 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® SA8775P | 4.242 ms | 0 - 115 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® SA8650P | 4.242 ms | 0 - 115 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® SA8255P | 4.242 ms | 0 - 115 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® QCS8450 | 4.396 ms | 0 - 175 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® Dragonwing™ IQ-9075 | 4.03 ms | 0 - 58 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® Dragonwing™ Q-8750 | 1.567 ms | 0 - 108 MB | NPU
| HRNetPose | TFLITE | float | Qualcomm® SA7255P | 89.858 ms | 1 - 33 MB | GPU
| HRNetPose | TFLITE | float | Qualcomm® SA8295P | 4.452 ms | 9 - 111 MB | NPU
| HRNetPose | TFLITE | w8a8 | Snapdragon® 8 Elite Gen 5 For Galaxy Mobile | 0.516 ms | 0 - 97 MB | NPU
| HRNetPose | TFLITE | w8a8 | Snapdragon® 8 Elite For Galaxy Mobile | 0.587 ms | 0 - 96 MB | NPU
| HRNetPose | TFLITE | w8a8 | Snapdragon® 8 Gen 3 Mobile | 0.694 ms | 0 - 140 MB | NPU
| HRNetPose | TFLITE | w8a8 | Snapdragon® 8 Gen 1 Mobile | 1.16 ms | 0 - 149 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ QCS6490 | 3.518 ms | 0 - 30 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ IQ-8275 | 1.133 ms | 0 - 31 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ QCS8550 (Proxy) | 0.936 ms | 0 - 2 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® SA8775P | 1.289 ms | 0 - 94 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® SA8650P | 1.289 ms | 0 - 94 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® SA8255P | 1.289 ms | 0 - 94 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® QCS8450 | 1.16 ms | 0 - 149 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ IQ-9075 | 1.157 ms | 0 - 30 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ Q-6690 | 9.657 ms | 0 - 202 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ Q-7790 | 1.339 ms | 0 - 90 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® Dragonwing™ Q-8750 | 0.587 ms | 0 - 96 MB | NPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® SA7255P | 91.19 ms | 1 - 43 MB | GPU
| HRNetPose | TFLITE | w8a8 | Qualcomm® SA8295P | 1.642 ms | 0 - 89 MB | NPU
| HRNetPose | TFLITE | w8a8 | Snapdragon® 7 Gen 4 Mobile | 1.339 ms | 0 - 90 MB | NPU

## License
* The license for the original implementation of HRNetPose can be found
  [here](https://github.com/leoxiaobin/deep-high-resolution-net.pytorch/blob/master/LICENSE).

## References
* [Deep High-Resolution Representation Learning for Human Pose Estimation](https://arxiv.org/abs/1902.09212)
* [Source Model Implementation](https://github.com/leoxiaobin/deep-high-resolution-net.pytorch)

## Community
* Join [our AI Hub Slack community](https://aihub.qualcomm.com/community/slack) to collaborate, post questions and learn more about on-device AI.
* For questions or feedback please [reach out to us](mailto:ai-hub-support@qti.qualcomm.com).
