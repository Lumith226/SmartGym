"""
SCRIPT KIỂM THỬ 1 VIDEO BẤT KỲ VỚI THÔNG BÁO LỖI TỨC THÌ & LƯU LOG CHI TIẾT
Dùng để chạy thử nghiệm nhanh bất kỳ video thể hình nào trên máy:
- Thông báo lỗi ngay lập tức sau khi đánh giá
- Tự động lưu log chi tiết vào file CSV và JSON để dễ dàng mở kiểm tra lại

Cách dùng:
  python test_single_video.py
  python test_single_video.py --video "test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4" --exercise squat
  python test_single_video.py --video "test_videos_benchmark/pushups/WIDE_HANDS_00001834.mp4" --exercise push_up
"""

import os
import sys
import time
import json
import csv
import argparse
from datetime import datetime
import cv2
import torch
import numpy as np
from ultralytics import YOLO

if sys.platform == 'win32' and hasattr(sys.stdout, 'buffer'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(CURRENT_DIR, 'weights')
LOGS_DIR = os.path.join(CURRENT_DIR, 'logs')
os.makedirs(LOGS_DIR, exist_ok=True)

from onnx_gym_analyzer import ONNXGymAnalyzer, EXERCISE_CONFIG
from enhanced_pose_processor import EnhancedPoseProcessor


def pick_video_file_dialog() -> str:
    """Mở hộp thoại Windows để chọn file video."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title="Chọn video bài tập để kiểm thử lỗi tức thì",
            filetypes=[
                ("Video files", "*.mp4;*.avi;*.mov;*.mkv;*.webm;*.flv"),
                ("All files", "*.*")
            ]
        )
        root.destroy()
        return file_path if file_path else ""
    except Exception as e:
        print(f"[ERROR] Không thể mở hộp thoại chọn file: {e}")
        return ""


def sample_video_32_frames(video_path: str):
    cap = cv2.VideoCapture(video_path)
    total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1.0
    h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1.0

    if total_f < 6:
        cap.release()
        return None, (w, h), total_f

    if total_f < 32:
        indices = list(range(total_f)) + [total_f - 1] * (32 - total_f)
    else:
        indices = np.linspace(0, total_f - 1, 32, dtype=int)

    target_set = set(indices)
    cur_f = 0
    sampled_frames = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if cur_f in target_set:
            sampled_frames.append(frame)
        cur_f += 1
    cap.release()
    return sampled_frames, (w, h), total_f


def main():
    parser = argparse.ArgumentParser(description="Kiểm thử 1 video với thông báo lỗi tức thì & lưu log")
    parser.add_argument('--video', type=str, default=None, help='Đường dẫn video kiểm thử (.mp4)')
    parser.add_argument('--exercise', type=str, default='squat', help='Tên bài tập: squat, push_up, jump_jack, situp, pull_up, bench_pressing')
    args = parser.parse_args()

    video_path = args.video
    if not video_path or not os.path.exists(video_path):
        print(">>> Vui lòng chọn tệp video từ hộp thoại mở ra...")
        video_path = pick_video_file_dialog()

    if not video_path or not os.path.exists(video_path):
        print("[THÔNG BÁO] Chưa chọn video hoặc tệp không tồn tại. Kết thúc.")
        return

    ex_key = args.exercise.lower().strip()
    analyzer = ONNXGymAnalyzer()
    ex_key = analyzer.normalize_exercise(ex_key)

    if ex_key not in EXERCISE_CONFIG:
        print(f"[ERROR] Không hỗ trợ bài tập '{ex_key}'. Danh sách: {list(EXERCISE_CONFIG.keys())}")
        return

    cfg = EXERCISE_CONFIG[ex_key]
    print("\n" + "=" * 80)
    print(f"      KIỂM THỬ VIDEO: {os.path.basename(video_path)}")
    print(f"      BÀI TẬP: {cfg['name_vi'].upper()} (MÔ HÌNH V2 QUALCOMM)")
    print("=" * 80)

    # 1. Trích xuất frames
    print(">>> Đang nạp và trích xuất khung hình từ video...")
    frames, (w, h), total_f = sample_video_32_frames(video_path)
    if not frames:
        print("[ERROR] Không thể đọc được frames từ video!")
        return
    print(f"    Tổng frame trong video gốc: {total_f} frames | Đã lấy mẫu: {len(frames)} frames")

    # 2. Chạy YOLOv8-Pose
    yolo_path = os.path.join(WEIGHTS_DIR, 'yolov8n-pose.pt')
    device = 0 if torch.cuda.is_available() else 'cpu'
    print(f">>> Đang trích xuất 17 khớp xương qua YOLOv8-Pose trên thiết bị: {device}...")
    yolo_model = YOLO(yolo_path)
    results = yolo_model(frames, verbose=False, device=device, batch=32)

    raw_kpts_list = []
    for r in results:
        if len(r.keypoints) > 0:
            k = r.keypoints.data[0].cpu().numpy()
            norm_k = np.zeros((3, 17), dtype=np.float32)
            norm_k[0, :] = k[:, 0] / w
            norm_k[1, :] = k[:, 1] / h
            norm_k[2, :] = k[:, 2]
            raw_kpts_list.append(norm_k)
        else:
            raw_kpts_list.append(np.zeros((3, 17), dtype=np.float32))

    while len(raw_kpts_list) < 32:
        raw_kpts_list.append(raw_kpts_list[-1] if raw_kpts_list else np.zeros((3, 17), dtype=np.float32))
    raw_kpts_list = raw_kpts_list[:32]

    kpts_array = np.array(raw_kpts_list, dtype=np.float32)  # (32, 3, 17)
    tensor_32 = np.transpose(kpts_array, (1, 0, 2))        # (3, 32, 17)

    # 3. Phân tích qua ONNX Gym Analyzer V2
    print(">>> Đang phân tích chuyển động qua ST-GCN++ V2 & Bộ lọc cơ sinh học...")
    eval_res = analyzer.predict_rep_tensor(tensor_32, exercise_type=ex_key)

    is_corr = eval_res['is_correct']
    conf_pct = eval_res['confidence'] * 100
    class_name = eval_res['class_name_vi']
    feedback = eval_res['feedback_vi']
    cam_view = eval_res.get('camera_view_vi', 'Chính diện / Khác')
    latency = eval_res['latency_ms']

    # 4. THÔNG BÁO LỖI NGAY LẬP TỨC CHO NGƯỜI DÙNG
    print("\n" + "=" * 80)
    print("                 KẾT QUẢ ĐÁNH GIÁ KỸ THUẬT NGAY SAU REP")
    print("=" * 80)
    if is_corr:
        print(f"🔔 [TRẠNG THÁI]: ĐÚNG CHUẨN KỸ THUẬT! (CORRECT)")
        print(f"   Độ tin cậy: {conf_pct:.1f}% | Độ trễ suy luận ONNX: {latency:.2f} ms")
        print(f"   Lời khen HLV: {feedback}")
    else:
        print(f"⚠️  [TRẠNG THÁI]: PHÁT HIỆN LỖI SAI KỸ THUẬT!")
        print(f"   Lỗi phát hiện: {class_name.upper()} (Mã lỗi: {eval_res['class_code']})")
        print(f"   Độ tin cậy lỗi: {conf_pct:.1f}% | Độ trễ suy luận ONNX: {latency:.2f} ms")
        print(f"👉 HLV HƯỚNG DẪN CẦN SỬA: {feedback}")

    print(f"\n📷 [Góc quay camera phát hiện]: {cam_view}")
    if eval_res.get('view_note'):
        print(f"💡 [Lưu ý góc khuất]: {eval_res['view_note']}")

    if eval_res.get('biomechanics'):
        bio_items = [f"{k}: {v}" for k, v in eval_res['biomechanics'].items()]
        print(f"📊 [Chỉ số cơ sinh học]: {' | '.join(bio_items)}")

    print(f"\n📈 [Phân bổ xác suất các lớp]:")
    for c_name, p in eval_res['probabilities'].items():
        bar_len = int(p * 30)
        bar_str = "█" * bar_len + "░" * (30 - bar_len)
        print(f"   • {c_name:<20}: {bar_str} {p*100:5.1f}%")
    print("=" * 80)

    # 5. LƯU LOG TỰ ĐỘNG RA FILE CSV VÀ JSON
    time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    time_tag = datetime.now().strftime("%Y%m%d_%H%M%S")

    csv_path = os.path.join(LOGS_DIR, "video_test_history.csv")
    json_path = os.path.join(LOGS_DIR, f"video_test_{time_tag}.json")

    # Ghi nối tiếp vào CSV lịch sử
    file_exists = os.path.exists(csv_path)
    with open(csv_path, 'a', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow([
                "Thời gian",
                "Tên Video",
                "Bài tập",
                "Trạng thái",
                "Tên lỗi phát hiện",
                "Mã lỗi",
                "Độ tin cậy (%)",
                "Góc nhìn Camera",
                "Lời khuyên HLV",
                "Độ trễ (ms)",
                "Đường dẫn file video"
            ])
        writer.writerow([
            time_str,
            os.path.basename(video_path),
            cfg['name_vi'],
            "ĐÚNG CHUẨN" if is_corr else "CÓ LỖI",
            class_name,
            eval_res['class_code'],
            f"{conf_pct:.2f}%",
            cam_view,
            feedback,
            latency,
            video_path
        ])

    # Ghi chi tiết ra file JSON riêng
    detail_data = {
        'test_time': time_str,
        'video_file': os.path.basename(video_path),
        'video_full_path': video_path,
        'exercise': ex_key,
        'exercise_name_vi': cfg['name_vi'],
        'evaluation': eval_res
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(detail_data, f, ensure_ascii=False, indent=2)

    print(f"\n📁 [ĐÃ LƯU LOG KIỂM THỬ THÀNH CÔNG]:")
    print(f"   • Bảng tổng hợp CSV (Xem trong Excel): {csv_path}")
    print(f"   • Chi tiết JSON:                       {json_path}")
    print("=" * 80)


if __name__ == '__main__':
    main()
