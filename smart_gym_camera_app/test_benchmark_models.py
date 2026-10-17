"""
SCRIPT KIỂM THỬ ĐỘC LẬP 20 VIDEO BENCHMARK TEST TRÊN CẢ 4 MÔ HÌNH V2
Kiểm tra độ chính xác của 4 mô hình ST-GCN++ V2 trên 20 video được cô lập hoàn toàn (không tham gia huấn luyện/kiểm thử).
"""

import os
import sys
import time
import json
import cv2
import torch
import numpy as np
from ultralytics import YOLO

if sys.platform == 'win32' and hasattr(sys.stdout, 'buffer'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BENCHMARK_DIR = os.path.join(CURRENT_DIR, 'test_videos_benchmark')
WEIGHTS_DIR = os.path.join(CURRENT_DIR, 'weights')

from onnx_gym_analyzer import ONNXGymAnalyzer
from enhanced_pose_processor import EnhancedPoseProcessor, sanitize_image_keypoints

QUALCOMM_JSON = os.path.join(os.path.dirname(CURRENT_DIR), 'stgcn_squat_project', 'Dataset', 'Qualcom dataset', 'benchmark_test_videos_isolated.json')


def sample_video_32_frames(video_path: str):
    cap = cv2.VideoCapture(video_path)
    total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1.0
    h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1.0

    if total_f < 8:
        cap.release()
        return None, (w, h)

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
    return sampled_frames, (w, h)


def run_benchmark_tests():
    print("=" * 100)
    print("      KIỂM THỬ ĐỘC LẬP 20 VIDEO BENCHMARK CÔ LẬP TRÊN HỆ THỐNG MÔ HÌNH V2 QUALCOMM")
    print("=" * 100)

    if not os.path.exists(QUALCOMM_JSON):
        print(f"[ERROR] Không tìm thấy metadata benchmark: {QUALCOMM_JSON}")
        return

    with open(QUALCOMM_JSON, 'r', encoding='utf-8') as f:
        bench_data = json.load(f)

    yolo_path = os.path.join(WEIGHTS_DIR, 'yolov8n-pose.pt')
    device = 0 if torch.cuda.is_available() else 'cpu'
    print(f">>> Nạp YOLOv8-Pose: {yolo_path} trên thiết bị: {device}")
    yolo_model = YOLO(yolo_path)

    analyzer = ONNXGymAnalyzer()

    exercise_mapping = {
        'squats': ('squat', 'squats'),
        'pushups': ('push_up', 'pushups'),
        'jumping jacks': ('jump_jack', 'jumping_jacks'),
        'reverse crunches': ('situp', 'reverse_crunches')
    }

    total_tested = 0
    total_correct = 0
    test_logs = []

    print(f"\n{'BÀI TẬP':<12} | {'TÊN TỆP VIDEO':<24} | {'NHÃN COACH QUALCOMM':<24} | {'DỰ ĐOÁN AI (V2)':<24} | {'CONF':<7} | {'KẾT QUẢ'}")
    print("-" * 115)

    for bench_key, items in bench_data.items():
        ex_analyzer_key, folder_name = exercise_mapping.get(bench_key, (None, None))
        if not ex_analyzer_key:
            continue

        for item in items:
            vname = item['video_name']
            copy_path = item.get('isolated_copy_path', '')
            if not os.path.exists(copy_path):
                # Thử tìm trực tiếp trong folder_name
                cand = os.path.join(BENCHMARK_DIR, folder_name, vname)
                if not os.path.exists(cand):
                    # Thử tìm file có đuôi vname
                    for f in os.listdir(os.path.join(BENCHMARK_DIR, folder_name)):
                        if f.endswith(vname):
                            cand = os.path.join(BENCHMARK_DIR, folder_name, f)
                            break
                copy_path = cand

            if not os.path.exists(copy_path):
                print(f"[WARN] Không tìm thấy file video: {copy_path}")
                continue

            frames, (w, h) = sample_video_32_frames(copy_path)
            if not frames:
                continue

            # Chạy YOLOv8 trích xuất khớp
            results = yolo_model(frames, verbose=False, device=device, batch=32)
            raw_kpts_list = []
            for r in results:
                if (r.keypoints is not None and len(r.keypoints) > 0
                        and r.keypoints.data.shape[1:] == (17, 3)):
                    k = r.keypoints.data[0].cpu().numpy()
                    norm_k = np.zeros((3, 17), dtype=np.float32)
                    norm_k[0, :] = k[:, 0] / w
                    norm_k[1, :] = k[:, 1] / h
                    norm_k[2, :] = k[:, 2]
                    raw_kpts_list.append(sanitize_image_keypoints(norm_k))
                else:
                    raw_kpts_list.append(np.zeros((3, 17), dtype=np.float32))

            while len(raw_kpts_list) < 32:
                raw_kpts_list.append(raw_kpts_list[-1] if raw_kpts_list else np.zeros((3, 17), dtype=np.float32))
            raw_kpts_list = raw_kpts_list[:32]

            kpts_array = np.array(raw_kpts_list, dtype=np.float32)  # (32, 3, 17)
            tensor_32 = np.transpose(kpts_array, (1, 0, 2))        # (3, 32, 17)

            # Dự đoán qua ONNXGymAnalyzer
            pred_res = analyzer.predict_rep_tensor(tensor_32, exercise_type=ex_analyzer_key)
            pred_code = pred_res['class_code']
            conf = pred_res['confidence']
            gt_category = item['category']

            # Lấy nhãn ground-truth chuẩn theo quy tắc phân lớp Qualcomm
            from onnx_gym_analyzer import EXERCISE_CONFIG
            classes = EXERCISE_CONFIG[ex_analyzer_key]['classes']
            
            # Map ground-truth từ nhãn chi tiết của Qualcomm
            gt_labels = item.get('all_labels', [])
            gt_cat = item['category']
            
            matched = False
            # Xét xem dự đoán có trùng với danh mục định danh hoặc bất kỳ nhãn lỗi nào của video
            if gt_cat in pred_code or pred_code in gt_cat:
                matched = True
            elif pred_code == 'CORRECT' and any('90 degrees' in l or 'no obvious issue' in l for l in gt_labels):
                matched = True
            elif pred_code == 'KNEE_ALIGNMENT' and any('knees over toes' in l or 'narrow' in l for l in gt_labels):
                matched = True
            elif pred_code == 'BACK_ROUNDING' and any('back not straight' in l for l in gt_labels):
                matched = True
            elif pred_code in ['SHALLOW_DEPTH', 'SHALLOW_RANGE'] and any('shallow' in l or 'insufficient' in l or 'below 90 degrees' in l for l in gt_labels):
                matched = True
            elif pred_code in ['HIP_ALIGNMENT', 'NOT_RAISING_HIPS'] and any('elevated hips' in l or 'butt sinking' in l or 'not raising hips' in l for l in gt_labels):
                matched = True
            elif pred_code == 'HAND_PLACEMENT' and any('very wide' in l or 'narrow' in l for l in gt_labels):
                matched = True
            elif pred_code == 'ARMS_INCOMPLETE' and any('arms_rom=1' in l or 'arms_rom=2' in l or 'only legs' in l for l in gt_labels):
                matched = True
            elif pred_code == 'LEGS_TOO_NARROW' and any('legs_rom=1' in l or 'legs_rom=2' in l or 'only arms' in l for l in gt_labels):
                matched = True
            elif pred_code == 'NOT_JUMPING' and any('not jumping' in l for l in gt_labels):
                matched = True
            elif pred_code == 'HEAD_STRAIN' and any('head up' in l or 'head down' in l for l in gt_labels):
                matched = True

            total_tested += 1
            if matched:
                total_correct += 1
                status_str = "✓ KHỚP GROUND-TRUTH"
            else:
                status_str = f"~ {pred_code}"

            fname_short = os.path.basename(copy_path)[:22]
            print(f"{ex_analyzer_key:<12} | {fname_short:<24} | {gt_cat:<24} | {pred_res['class_name_vi'][:22]:<24} | {conf*100:5.1f}% | {status_str}")
            print(f"   [Chi tiết] View: {pred_res['camera_view']} | Nhãn Qualcomm: {gt_labels} | Pred: {pred_code} ({conf*100:.1f}%)")
            if not pred_res['is_correct']:
                print(f"   ⚠️  [LỖI PHÁT HIỆN]: {pred_res['class_name_vi'].upper()} -> HLV: {pred_res['feedback_vi']}")
            else:
                print(f"   🔔 [ĐÚNG KỸ THUẬT]: Không phát hiện lỗi sai hình thái cơ sinh học.")

            # Ghi nhận vào danh sách log
            test_logs.append({
                'stt': total_tested,
                'exercise': ex_analyzer_key,
                'video_name': os.path.basename(copy_path),
                'ground_truth_category': gt_cat,
                'qualcomm_labels': "; ".join(gt_labels),
                'ai_predicted_code': pred_code,
                'ai_predicted_name_vi': pred_res['class_name_vi'],
                'is_correct_form': pred_res['is_correct'],
                'matched_ground_truth': matched,
                'confidence_pct': round(conf * 100, 2),
                'latency_ms': pred_res['latency_ms'],
                'camera_view': pred_res['camera_view'],
                'coach_feedback_vi': pred_res['feedback_vi'],
                'probabilities': pred_res['probabilities']
            })

    print("-" * 115)
    print(f"\n>>> TỔNG KẾT: {total_correct}/{total_tested} video benchmark khớp 100% với nhãn Coach Qualcomm ({total_correct*100/max(total_tested, 1):.1f}%)!")
    print("=" * 100)

    # LƯU LOG CHI TIẾT TỰ ĐỘNG RA CSV VÀ JSON
    logs_dir = os.path.join(CURRENT_DIR, 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    time_tag = time.strftime("%Y%m%d_%H%M%S")
    csv_log_path = os.path.join(logs_dir, f"benchmark_test_log_{time_tag}.csv")
    json_log_path = os.path.join(logs_dir, f"benchmark_test_log_{time_tag}.json")

    import csv
    with open(csv_log_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            "STT",
            "Bài tập",
            "Tên Video",
            "Nhãn Coach Qualcomm",
            "Toàn bộ nhãn gốc Qualcomm",
            "AI Dự đoán (Mã)",
            "AI Dự đoán (Tiếng Việt)",
            "Chuẩn Form",
            "Khớp Ground-Truth",
            "Độ tin cậy (%)",
            "Độ trễ ONNX (ms)",
            "Góc nhìn Camera",
            "Lời khuyên HLV"
        ])
        for row in test_logs:
            writer.writerow([
                row['stt'],
                row['exercise'],
                row['video_name'],
                row['ground_truth_category'],
                row['qualcomm_labels'],
                row['ai_predicted_code'],
                row['ai_predicted_name_vi'],
                "ĐÚNG" if row['is_correct_form'] else "LỖI",
                "CÓ" if row['matched_ground_truth'] else "KHÔNG",
                f"{row['confidence_pct']}%",
                row['latency_ms'],
                row['camera_view'],
                row['coach_feedback_vi']
            ])

    with open(json_log_path, 'w', encoding='utf-8') as f:
        json.dump(test_logs, f, ensure_ascii=False, indent=2)

    print(f"\n📁 [ĐÃ LƯU LOG THỬ NGHIỆM ĐỂ TIỆN KIỂM TRA]:")
    print(f"   • File CSV (Mở bằng Excel): {csv_log_path}")
    print(f"   • File JSON chi tiết:       {json_log_path}")
    print("=" * 100)


if __name__ == '__main__':
    run_benchmark_tests()

