"""
MODULE RTMPose TRACKER WRAPPER (OpenMMLab RTMPose-M + SimCC)
Đóng gói bộ đôi Detector (YOLOX-M / RTMDet) và Pose Estimator (RTMPose-M)
để trích xuất 17 điểm khớp xương COCO chuẩn hóa shape (3, 17) cho hệ thống Smart Gym.
"""

import os
import sys
import numpy as np
import cv2
import onnxruntime as ort

ort.set_default_logger_severity(3)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(CURRENT_DIR, 'weights')

if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

# Tự động nạp CUDA DLL từ PyTorch để ONNX Runtime kích hoạt NVIDIA RTX GPU
try:
    import torch
    if hasattr(os, 'add_dll_directory'):
        torch_lib = os.path.join(os.path.dirname(torch.__file__), 'lib')
        if os.path.exists(torch_lib):
            os.add_dll_directory(torch_lib)
            os.environ['PATH'] = torch_lib + os.pathsep + os.environ.get('PATH', '')
except Exception:
    pass

try:
    import rtmlib
except ImportError:
    raise ImportError("Vui lòng cài đặt rtmlib: pip install rtmlib")


class RTMPoseTracker:
    """Wrapper cho OpenMMLab RTMPose (YOLOX/RTMDet + RTMPose-M)."""

    def __init__(self, mode: str = 'balanced', device: str = None):
        if device is None:
            try:
                import torch
                device = 'cuda' if torch.cuda.is_available() else 'cpu'
            except Exception:
                device = 'cpu'
        self.mode = mode
        self.device = device
        self.previous_center = None
        
        # Đường dẫn weights cục bộ nếu có
        det_onnx = os.path.join(WEIGHTS_DIR, 'yolox_m_8xb8-300e_humanart-c2c7a14a.onnx')
        pose_onnx = os.path.join(WEIGHTS_DIR, 'rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.onnx')

        if os.path.exists(det_onnx) and os.path.exists(pose_onnx):
            print(f">>> [RTMPose Engine] Khởi tạo từ tệp weights cục bộ:")
            print(f"    • Detector ONNX: {os.path.basename(det_onnx)}")
            print(f"    • Pose ONNX:     {os.path.basename(pose_onnx)}")
            self.body = rtmlib.Body(
                det=det_onnx,
                det_input_size=(640, 640),
                pose=pose_onnx,
                pose_input_size=(192, 256),
                mode=mode,
                backend='onnxruntime',
                device=device
            )
        else:
            print(f">>> [RTMPose Engine] Khởi tạo rtmlib.Body (Mode: {mode}, Device: {device})...")
            self.body = rtmlib.Body(mode=mode, backend='onnxruntime', device=device)
        # Hạn chế số luồng CPU để tránh hàng chục luồng cạnh tranh khi CUDA chạy.
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        opts.log_severity_level = 3
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if device == 'cuda' else ['CPUExecutionProvider']
        for model in [self.body.det_model, self.body.pose_model]:
            model.session = ort.InferenceSession(model.onnx_model, sess_options=opts, providers=providers)
        self.batch_session = None

    def reset(self):
        self.previous_center = None

    def process_frame(self, frame_bgr: np.ndarray, min_conf: float = 0.25):
        """
        Xử lý 1 khung hình BGR.
        Trả về:
            has_person (bool): Có phát hiện người hợp lệ hay không.
            norm_kpts (np.ndarray): Mảng shape (3, 17) gồm [x_norm, y_norm, confidence].
        """
        h, w = frame_bgr.shape[:2]
        norm_kpts = np.zeros((3, 17), dtype=np.float32)

        keypoints, scores = self.body(frame_bgr)

        if keypoints is None or len(keypoints) == 0 or len(scores) == 0:
            return False, norm_kpts

        # Tìm người có điểm tin cậy trung bình cao nhất
        mean_scores = [float(np.mean(s)) for s in scores]
        eligible = [i for i, value in enumerate(mean_scores) if value >= min_conf]
        if not eligible:
            return False, norm_kpts
        centers = [np.mean(points[[5, 6, 11, 12]], axis=0) / np.array([w, h]) for points in keypoints]
        if self.previous_center is None:
            best_idx = max(eligible, key=lambda i: mean_scores[i])
        else:
            best_idx = min(eligible, key=lambda i: float(np.linalg.norm(centers[i] - self.previous_center)))
            if np.linalg.norm(centers[best_idx] - self.previous_center) > .35:
                return False, norm_kpts
        self.previous_center = centers[best_idx]
        best_score = mean_scores[best_idx]

        if best_score < min_conf:
            return False, norm_kpts

        best_kpts = keypoints[best_idx]  # shape: (17, 2)
        best_sc = scores[best_idx]       # shape: (17,)

        norm_kpts[0, :] = np.clip(best_kpts[:, 0] / float(w), 0.0, 1.0)
        norm_kpts[1, :] = np.clip(best_kpts[:, 1] / float(h), 0.0, 1.0)
        norm_kpts[2, :] = np.clip(best_sc, 0.0, 1.0)

        return True, norm_kpts

    def process_batch(self, frames_list: list, min_conf: float = 0.25):
        """
        Xử lý danh sách các khung hình (ví dụ 32 frames).
        Trả về danh sách 32 mảng shape (3, 17).
        """
        kpts_list = []
        for frame in frames_list:
            has_person, norm_kpts = self.process_frame(frame, min_conf=min_conf)
            kpts_list.append(norm_kpts)
        return kpts_list

    def process_clip(self, frames_list):
        """Video offline: tìm hộp bao người trên 8 mốc, pose theo batch 16 ảnh.

        Dùng cùng thuật toán cho trích xuất và kiểm thử toàn video. Hộp bao hợp
        nhất giữ cả phần đứng chờ và đáy squat, không cắt bỏ ngữ cảnh thời gian.
        """
        import onnx
        if not frames_list:
            raise ValueError('Video không có frame')
        pose = self.body.pose_model
        if self.batch_session is None:
            source = str(pose.onnx_model)
            batch_path = source.replace('.onnx', '_batch.onnx')
            if not os.path.exists(batch_path):
                graph = onnx.load(source)
                for node in [*graph.graph.input, *graph.graph.output]:
                    node.type.tensor_type.shape.dim[0].dim_param = 'batch'
                onnx.checker.check_model(graph)
                onnx.save(graph, batch_path)
            opts = ort.SessionOptions(); opts.intra_op_num_threads = 2; opts.log_severity_level = 3
            self.batch_session = ort.InferenceSession(batch_path, sess_options=opts,
                                                      providers=pose.session.get_providers())
        boxes = []
        center = None
        for index in np.linspace(0, len(frames_list)-1, min(8, len(frames_list))).astype(int):
            found = self.body.det_model(frames_list[index])
            if len(found):
                centers = (found[:, :2] + found[:, 2:4]) / 2
                chosen = int(np.argmax((found[:, 2]-found[:, 0])*(found[:, 3]-found[:, 1]))) if center is None else int(np.argmin(np.linalg.norm(centers-center, axis=1)))
                boxes.append(found[chosen, :4]); center = centers[chosen]
        if not boxes:
            return [np.zeros((3,17),np.float32) for _ in frames_list]
        boxes = np.array(boxes)
        union = [boxes[:,0].min(), boxes[:,1].min(), boxes[:,2].max(), boxes[:,3].max()]
        crops, centers, scales = [], [], []
        for frame in frames_list:
            crop, c, scale = pose.preprocess(frame, union)
            crops.append(crop.transpose(2,0,1)); centers.append(c); scales.append(scale)
        results = []
        for start in range(0,len(crops),16):
            batch = np.ascontiguousarray(crops[start:start+16], dtype=np.float32)
            outputs = self.batch_session.run(None,{self.batch_session.get_inputs()[0].name:batch})
            for j in range(len(batch)):
                i = start+j
                points, scores = pose.postprocess([out[j:j+1] for out in outputs], centers[i], scales[i])
                raw = np.zeros((3,17),np.float32)
                if float(np.mean(scores[0])) >= .25:
                    h,w = frames_list[i].shape[:2]
                    raw[:2] = points[0].T / float(h)
                    raw[2] = np.clip(scores[0],0,1)
                results.append(raw)
        return results
