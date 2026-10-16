"""
SCRIPT KIỂM TRA NHẬT KÝ VÀ TỌA ĐỘ CÁC REP ĐÃ TẬP (INSPECT LOGS)
Xem lại toàn bộ lịch sử tập luyện, các lỗi và kiểm tra mảng tọa độ 17 khớp của từng rep.

Cách dùng:
  python inspect_log.py
"""

import os
import sys
import json
import glob
import numpy as np
import pandas as pd

if sys.platform == 'win32' and hasattr(sys.stdout, 'buffer'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_ROOT = os.path.join(CURRENT_DIR, 'logs')


def main():
    print("=" * 80)
    print("   CÔNG CỤ KIỂM TRA LỊCH SỬ TẬP LUYỆN & TỌA ĐỘ 17 KHỚP (SMART GYM)")
    print("=" * 80)

    session_dirs = sorted(glob.glob(os.path.join(LOGS_ROOT, "session_*")))
    if not session_dirs:
        print("[THÔNG BÁO] Chưa có phiên tập nào được lưu trong thư mục logs/")
        return

    latest_session = session_dirs[-1]
    print(f">>> Phiên tập gần nhất: {os.path.basename(latest_session)}")

    csv_path = os.path.join(latest_session, "summary.csv")
    if os.path.exists(csv_path):
        df = pd.read_csv(csv_path)
        print("\n--- BẢNG TỔNG HỢP CÁC REP TRONG PHIÊN: ---")
        print(df.to_string(index=False))

    tensors_dir = os.path.join(latest_session, "tensors")
    tensor_files = sorted(glob.glob(os.path.join(tensors_dir, "*.npy")))
    print(f"\n>>> Tìm thấy {len(tensor_files)} file tọa độ 17 khớp (.npy):")

    for idx, tf in enumerate(tensor_files[:5], 1):
        data = np.load(tf)
        print(f"  [{idx}] {os.path.basename(tf)} | Kích thước: {data.shape} (C:3, T:32, V:17)")

    # Đánh giá lại bằng Bộ phân tích góc nhìn (View-Aware Gating)
    try:
        from onnx_gym_analyzer import ONNXGymAnalyzer
        analyzer = ONNXGymAnalyzer()
        print("\n" + "=" * 80)
        print("   TÁI ĐÁNH GIÁ CÁC TENSOR BẰNG BỘ PHÂN TÍCH GÓC NHÌN (CAMERA VIEW-AWARE GATING)")
        print("=" * 80)
        for idx, tf in enumerate(tensor_files, 1):
            data = np.load(tf)
            res = analyzer.predict_rep_tensor(data, exercise_type='squat')
            status_symbol = "✓ ĐÚNG" if res['is_correct'] else "✗ CHƯA ĐÚNG"
            bio = res.get('biomechanics', {})
            bio_str = f"Gập gối đáy: {bio.get('min_knee_angle', 'N/A')}° | Nghiêng thân: {bio.get('max_torso_lean', 'N/A')}°"
            print(f"  [{idx}] {os.path.basename(tf)}:")
            print(f"      • Góc nhìn: {res['camera_view_vi']}")
            print(f"      • Đánh giá: {status_symbol} - {res['class_name_vi']} ({res['confidence']*100:.1f}%)")
            print(f"      • Chỉ số cơ sinh học: {bio_str}")
            if res.get('view_note'):
                print(f"      • Ghi chú: {res['view_note']}")
    except Exception as e:
        print(f"[NOTE] Không thể tái đánh giá tensor: {e}")

    print("\n" + "=" * 80)


if __name__ == '__main__':
    main()
