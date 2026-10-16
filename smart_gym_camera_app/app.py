"""
GIAO DIỆN KIỂM THỬ ĐA ĐỘNG TÁC THỜI GIAN THỰC (SMART GYM APP)
Hỗ trợ 2 chế độ:
1. Chế độ WEBCAM: Camera máy tính trực tiếp.
2. Chế độ TẢI VIDEO: Chọn file video (.mp4, .avi, .mov) bất kỳ từ máy tính để test!

Phím tắt:
- [V]: Mở cửa sổ chọn file video từ máy tính
- [C]: Chuyển về Camera trực tiếp (Webcam)
- [P] hoặc [SPACE]: Tạm dừng / Tiếp tục phát video
- [1-6]: Chuyển đổi giữa 6 bài tập
- [M]: Bật / Tắt âm thanh thông báo
- [R]: Phát lại video từ đầu / Reset rep count
- [Q] hoặc [ESC]: Thoát ứng dụng
"""

import os
import sys
import time
import threading
import argparse
import winsound
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

if sys.platform == 'win32' and hasattr(sys.stdout, 'buffer'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from onnx_gym_analyzer import ONNXGymAnalyzer, EXERCISE_CONFIG
from rep_tracker import ExerciseRepTracker
from session_logger import SessionLogger
from ultralytics import YOLO

# Cặp kết nối 17 khớp xương COCO
SKELETON_PAIRS = [
    (0, 1), (0, 2), (1, 3), (2, 4),           # Đầu
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),  # Tay & Thân trên
    (5, 11), (6, 12), (11, 12),               # Thân mình
    (11, 13), (13, 15), (12, 14), (14, 16)    # Chân
]

EXERCISES_LIST = [
    ('1', 'squat', '1. Gánh đùi (Squat V2 - Qualcomm)'),
    ('2', 'push_up', '2. Chống đẩy (Push-up V2 - Qualcomm)'),
    ('3', 'jump_jack', '3. Bật nhảy (Jumping Jack V2 - Qualcomm)'),
    ('4', 'situp', '4. Gập bụng ngược (Reverse Crunches / Sit-up V2)'),
    ('5', 'squat_v1', '5. Gánh đùi (Squat V1 - Model cũ)'),
    ('6', 'pull_up', '6. Hít xà đơn (Pull-up)'),
    ('7', 'bench_pressing', '7. Đẩy ngực nằm (Bench Press)')
]

SOUND_ENABLED = True


def play_audio_feedback(is_correct: bool):
    """Phát âm thanh thông báo trong luồng nền (background thread)."""
    if not SOUND_ENABLED:
        return

    def _sound_worker():
        try:
            if is_correct:
                winsound.Beep(1046, 130)
                time.sleep(0.04)
                winsound.Beep(1318, 220)
            else:
                winsound.Beep(440, 180)
                time.sleep(0.05)
                winsound.Beep(349, 280)
        except Exception:
            pass

    threading.Thread(target=_sound_worker, daemon=True).start()


def pick_video_file() -> str:
    """Mở hộp thoại Windows để người dùng chọn file video từ máy tính."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title="Chọn video bài tập thể hình (.mp4, .avi, .mov, .mkv)",
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


def load_font(size: int = 20):
    for font_name in ['arial.ttf', 'segoeui.ttf', 'tahoma.ttf']:
        try:
            return ImageFont.truetype(font_name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def draw_vietnamese_text(img_bgr, text, position, font_size=20, color_bgr=(255, 255, 255)):
    """Vẽ chữ tiếng Việt có dấu lên ảnh OpenCV thông qua PIL."""
    x, y = position
    color_rgb = (color_bgr[2], color_bgr[1], color_bgr[0])
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    draw = ImageDraw.Draw(pil_img)
    font = load_font(font_size)
    draw.text((x, y), text, font=font, fill=color_rgb)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def draw_skeleton(frame, kpts, width, height, conf_thresh=0.22):
    """Vẽ 17 khớp xương và các đường nối neon."""
    pts = []
    for i in range(17):
        cx = int(kpts[0, i] * width)
        cy = int(kpts[1, i] * height)
        conf = kpts[2, i]
        pts.append((cx, cy, conf))

    # Đường nối
    for p1, p2 in SKELETON_PAIRS:
        if pts[p1][2] > conf_thresh and pts[p2][2] > conf_thresh:
            cv2.line(frame, (pts[p1][0], pts[p1][1]), (pts[p2][0], pts[p2][1]), (0, 220, 255), 2, cv2.LINE_AA)

    # Khớp tròn
    for i, (cx, cy, conf) in enumerate(pts):
        if conf > conf_thresh:
            color = (0, 255, 0) if i in [5, 6, 11, 12] else (255, 100, 0)
            cv2.circle(frame, (cx, cy), 5, color, -1, cv2.LINE_AA)
            cv2.circle(frame, (cx, cy), 7, (255, 255, 255), 1, cv2.LINE_AA)


def auto_brighten_low_light(frame, threshold=45.0):
    """
    Tự động bù sáng thích ứng (Adaptive Low-Light Enhancement: CLAHE + Gamma Correction)
    khi video hoặc phòng tập quá tối (< 45/255).
    Giúp YOLOv8 bắt khớp chuẩn xác và người dùng quan sát rõ hình thể trên màn hình.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_val = float(np.mean(gray))
    if mean_val < threshold:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        gamma = min(max(1.5, 45.0 / (mean_val + 1e-3)), 2.2)
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype('uint8')
        cl_boost = cv2.LUT(cl, table)
        limg = cv2.merge((cl_boost, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR), True, mean_val
    return frame, False, mean_val


def main():

    global SOUND_ENABLED

    parser = argparse.ArgumentParser(description="Smart Gym AI App (Camera & Video Mode)")
    parser.add_argument('--video', type=str, default=None, help='Đường dẫn file video kiểm thử (.mp4)')
    parser.add_argument('--exercise', type=str, default='squat', help='Tên bài tập: squat, push_up, pull_up, bench_pressing, situp, jump_jack')
    args = parser.parse_args()

    print("=" * 80)
    print("   KHỞI ĐỘNG SMART GYM APP - HỖ TRỢ CẢ WEBCAM VÀ TẢI VIDEO KIỂM THỬ")
    print("=" * 80)

    # 1. Nạp YOLOv8-Pose
    yolo_path = os.path.join(CURRENT_DIR, 'weights', 'yolov8n-pose.pt')
    if not os.path.exists(yolo_path):
        yolo_path = 'yolov8n-pose.pt'
    print(f">>> Đang nạp YOLOv8-Pose: {yolo_path}")
    pose_model = YOLO(yolo_path)

    # 2. Nạp ONNX Analyzer & Rep Tracker & Session Logger
    print(">>> Đang nạp engine ONNXGymAnalyzer & SessionLogger...")
    analyzer = ONNXGymAnalyzer()
    tracker = ExerciseRepTracker(analyzer)
    logger = SessionLogger()

    # 3. Xác định nguồn phát ban đầu
    current_ex_key = analyzer.normalize_exercise(args.exercise)
    input_source = 'webcam'
    video_path = None
    is_paused = False

    if args.video and os.path.exists(args.video):
        input_source = 'video'
        video_path = args.video
        cap = cv2.VideoCapture(video_path)
        print(f">>> Đang mở file video: {video_path}")
    else:
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            cap = cv2.VideoCapture(1)

    if not cap.isOpened():
        print("[ERROR] Không thể mở nguồn hình ảnh (Webcam hoặc Video)!")
        return

    window_name = 'Smart Gym AI - Camera & Video Assessment (ONNX Runtime)'
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280, 720)

    print("\n>>> HƯỚNG DẪN ĐIỀU KHIỂN:")
    print("  [V]: Tải video từ máy tính lên (Mở hộp thoại chọn file .mp4, .avi...)")
    print("  [C]: Chuyển về chế độ Camera trực tiếp (Webcam)")
    print("  [P] hoặc [SPACE]: Tạm dừng / Tiếp tục phát video (hoặc Đánh giá thủ công)")
    print("  [1-6]: Chuyển bài tập (1:Squat | 2:Push-up | 3:Pull-up | 4:Bench | 5:Sit-up | 6:Jump Jack)")
    print("  [M]: Bật / Tắt âm thanh thông báo")
    print("  [R]: Phát lại video từ đầu / Reset bộ đếm Reps")
    print("  [Q] hoặc [ESC]: Thoát ứng dụng\n")

    tracker.reset(current_ex_key)
    active_alert = None
    alert_duration = 3.5
    last_frame = None

    fps_time = time.time()
    fps = 0.0
    is_low_light = False

    while True:
        if not is_paused:
            ret, frame = cap.read()
            if not ret:
                if input_source == 'video':
                    # Nếu video kết thúc mà đang có rep dở dang (>= 10 frames) -> Tự động chốt đánh giá rep ngay!
                    if len(tracker.current_rep_frames) >= 10 and not getattr(tracker, '_video_ended_evaluated', False):
                        tracker._video_ended_evaluated = True
                        forced = tracker.force_evaluate_current_buffer()
                        if forced:
                            forced_res, rep_32 = forced
                            is_corr = forced_res['is_correct']
                            active_alert = {
                                'rep_num': tracker.rep_count,
                                'is_correct': is_corr,
                                'class_name_vi': forced_res['class_name_vi'],
                                'feedback_vi': forced_res['feedback_vi'],
                                'confidence': forced_res['confidence'],
                                'latency_ms': forced_res['latency_ms'],
                                'camera_view_vi': forced_res.get('camera_view_vi', ''),
                                'view_note': forced_res.get('view_note', ''),
                                'biomechanics': forced_res.get('biomechanics', {}),
                                'expire_time': time.time() + 6.0,  # Giữ thông báo lâu hơn khi hết video
                                'start_time': time.time()
                            }
                            play_audio_feedback(is_corr)
                            src_name = os.path.basename(video_path) if video_path else "Video"
                            logger.log_rep(
                                rep_num=tracker.rep_count,
                                exercise=current_ex_key,
                                eval_res=forced_res,
                                rep_tensor=rep_32,
                                raw_frame_count=tracker.last_raw_frames_count,
                                source_name=src_name
                            )
                            print("\n" + "=" * 80)
                            if is_corr:
                                print(f"🔔 [REP #{tracker.rep_count} - ĐÚNG FORM]: Kỹ thuật chuẩn! ({forced_res['confidence']*100:.1f}%) | ONNX: {forced_res['latency_ms']} ms")
                                print(f"   HLV: {forced_res['feedback_vi']}")
                            else:
                                print(f"⚠️  [REP #{tracker.rep_count} - PHÁT HIỆN LỖI]: {forced_res['class_name_vi'].upper()} ({forced_res['confidence']*100:.1f}%)")
                                print(f"👉 HLV NHẮC NHỞ CẦN SỬA: {forced_res['feedback_vi']}")
                            if forced_res.get('camera_view_vi'):
                                print(f"📷 Góc quay: {forced_res['camera_view_vi']}")
                            print(f"📁 ĐÃ LƯU LOG CHI TIẾT TẠI: {logger.csv_path}")
                            print("=" * 80)

                    # Đã phát hết video: hiển thị tổng kết và giữ frame cuối
                    if last_frame is not None:
                        frame = last_frame.copy()
                        stats = logger.get_summary_stats()
                        end_text = f"ĐÃ HẾT VIDEO | Tổng: {stats['total_reps']} Reps ({stats['correct_reps']} đúng, {stats['error_reps']} lỗi) | [L] Mở file Log  |  [R] Phát lại  |  [V] Đổi video  |  [C] Webcam"
                        frame = draw_vietnamese_text(frame, end_text, (30, 95), font_size=19, color_bgr=(0, 220, 255))
                        cv2.imshow(window_name, frame)
                        key = cv2.waitKey(30) & 0xFF
                        if key in [ord('q'), ord('Q'), 27]:
                            break
                        elif key in [ord('l'), ord('L')]:
                            logger.open_folder()
                            continue
                        elif key in [ord('r'), ord('R')]:
                            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            tracker.reset()
                            tracker._video_ended_evaluated = False
                            active_alert = None
                            continue
                        elif key in [ord('v'), ord('V')]:
                            chosen = pick_video_file()
                            if chosen and os.path.exists(chosen):
                                cap.release()
                                input_source = 'video'
                                video_path = chosen
                                cap = cv2.VideoCapture(video_path)
                                tracker.reset()
                                tracker._video_ended_evaluated = False
                                active_alert = None
                            continue
                        elif key in [ord('c'), ord('C')]:
                            cap.release()
                            input_source = 'webcam'
                            cap = cv2.VideoCapture(0)
                            tracker.reset()
                            tracker._video_ended_evaluated = False
                            active_alert = None
                            continue
                        continue
                    else:
                        break
                else:
                    break

            # Đối với Webcam thì lật gương; đối với Video gốc thì giữ nguyên
            if input_source == 'webcam':
                frame = cv2.flip(frame, 1)

            # Tự động bù sáng thông minh nếu môi trường / video thiếu sáng
            frame, is_low_light, orig_lum = auto_brighten_low_light(frame)

            last_frame = frame.copy()
        else:
            if last_frame is not None:
                frame = last_frame.copy()
            else:
                continue

        h, w = frame.shape[:2]
        now = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / (now - fps_time + 1e-6))
        fps_time = now

        # Chỉ chạy YOLO và Tracker khi không bị tạm dừng
        cur_view_name = getattr(tracker, 'cur_view_name', "CHƯA XÁC ĐỊNH")
        cur_view_color = getattr(tracker, 'cur_view_color', (180, 180, 180))

        if not is_paused:
            results = pose_model(frame, verbose=False, device=0 if cv2.cuda.getCudaEnabledDeviceCount() > 0 else 'cpu')
            norm_kpts = np.zeros((3, 17), dtype=np.float32)

            has_person = False
            if results and len(results[0].keypoints) > 0:
                kpts_data = results[0].keypoints.data[0].cpu().numpy()
                if kpts_data.shape[0] == 17:
                    has_person = True
                    norm_kpts[0, :] = kpts_data[:, 0] / w
                    norm_kpts[1, :] = kpts_data[:, 1] / h
                    norm_kpts[2, :] = kpts_data[:, 2]

                    # Phân tích nhanh góc quay camera thời gian thực
                    sh_dx = abs(norm_kpts[0, 5] - norm_kpts[0, 6])
                    hip_dx = abs(norm_kpts[0, 11] - norm_kpts[0, 12])
                    if sh_dx < 0.11 and hip_dx < 0.09:
                        cur_view_name = "QUAY NGANG (SIDE)"
                        cur_view_color = (0, 220, 255)
                    elif sh_dx > 0.18 and hip_dx > 0.12:
                        cur_view_name = "CHÍNH DIỆN (FRONT)"
                        cur_view_color = (0, 255, 100)
                    else:
                        cur_view_name = "GÓC CHÉO 45° (OBLIQUE)"
                        cur_view_color = (255, 180, 0)
                    tracker.cur_view_name = cur_view_name
                    tracker.cur_view_color = cur_view_color

            # Xử lý cắt rep & lọc khử nhảy khớp do che khuất
            if has_person:
                track_info = tracker.process_frame(norm_kpts)
                display_kpts = track_info.get('smoothed_kpts', norm_kpts)
                draw_skeleton(frame, display_kpts, w, h)
            else:
                track_info = {
                    'exercise': current_ex_key,
                    'rep_count': tracker.rep_count,
                    'state': 'NO PERSON',
                    'indicator': 0.0,
                    'last_result': tracker.last_result,
                    'just_finished_rep': False
                }

            # Kiểm tra rep vừa hoàn thành
            if track_info.get('just_finished_rep') and track_info.get('last_result'):
                res = track_info['last_result']
                is_corr = res['is_correct']

                active_alert = {
                    'rep_num': track_info['rep_count'],
                    'is_correct': is_corr,
                    'class_name_vi': res['class_name_vi'],
                    'feedback_vi': res['feedback_vi'],
                    'confidence': res['confidence'],
                    'latency_ms': res['latency_ms'],
                    'camera_view_vi': res.get('camera_view_vi', ''),
                    'view_note': res.get('view_note', ''),
                    'biomechanics': res.get('biomechanics', {}),
                    'expire_time': now + alert_duration,
                    'start_time': now
                }

                play_audio_feedback(is_corr)

                print("\n" + "=" * 75)
                if is_corr:
                    print(f"🔔 [REP {track_info['rep_count']}]: ĐÚNG CHUẨN KỸ THUẬT! ({res['confidence']*100:.1f}%) | Latency: {res['latency_ms']} ms")
                    print(f"   HLV: {res['feedback_vi']}")
                else:
                    print(f"⚠️  [REP {track_info['rep_count']}]: CHƯA ĐÚNG! LỖI: {res['class_name_vi'].upper()} ({res['confidence']*100:.1f}%) | Latency: {res['latency_ms']} ms")
                    print(f"👉 CẦN SỬA: {res['feedback_vi']}")
                if res.get('camera_view_vi'):
                    print(f"📷 [GÓC QUAY PHÁT HIỆN]: {res['camera_view_vi']}")
                if res.get('view_note'):
                    print(f"💡 [LƯU Ý GÓC KHUẤT]: {res['view_note']}")
                if res.get('biomechanics'):
                    bio_str = " | ".join([f"{k}: {v}" for k, v in res['biomechanics'].items()])
                    print(f"📊 [CHỈ SỐ CƠ SINH HỌC]: {bio_str}")
                print("=" * 75)

                # Lưu log & mảng tọa độ khớp
                if track_info.get('rep_tensor_32') is not None:
                    src_name = os.path.basename(video_path) if (input_source == 'video' and video_path) else 'Webcam PC'
                    logger.log_rep(
                        rep_num=track_info['rep_count'],
                        exercise=current_ex_key,
                        eval_res=res,
                        rep_tensor=track_info['rep_tensor_32'],
                        raw_frame_count=track_info.get('raw_frames_count', 32),
                        source_name=src_name
                    )
                    print(f"📁 [ĐÃ LƯU LOG CHI TIẾT]: {logger.csv_path}")


        # ---------------- GIAO DIỆN ĐỒ HỌA HUD ----------------
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (w, 85), (20, 20, 20), -1)
        cv2.rectangle(overlay, (0, h - 130), (w, h), (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

        # Thanh Menu hướng dẫn phím tắt (Top Bar)
        src_label = f"VIDEO: {os.path.basename(video_path)}" if input_source == 'video' else "CAMERA TRỰC TIẾP"
        pause_label = " [TẠM DỪNG]" if is_paused else ""
        low_light_label = " [💡 BÙ SÁNG TỰ ĐỘNG]" if is_low_light else ""
        menu_text = f"[{src_label}{pause_label}{low_light_label}] | [V] Chọn video  |  [C] Webcam  |  [P/Space] Pause  |  [1-7] Chọn bài  |  [R] Reset  |  [Q] Thoát"
        frame = draw_vietnamese_text(frame, menu_text, (20, 10), font_size=15, color_bgr=(210, 210, 210))

        # Tiêu đề bài tập & Chỉ báo góc nhìn camera (Camera View Indicator)
        ex_title = f"Bài tập: {EXERCISE_CONFIG[current_ex_key]['name_vi'].upper()}"
        frame = draw_vietnamese_text(frame, ex_title, (20, 42), font_size=23, color_bgr=(0, 230, 255))
        view_indicator = f"Góc: [{cur_view_name}]"
        frame = draw_vietnamese_text(frame, view_indicator, (460, 44), font_size=18, color_bgr=cur_view_color)

        # Số Reps
        reps_text = f"Reps: {tracker.rep_count}"
        cv2.putText(frame, reps_text, (w - 380, 68), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2, cv2.LINE_AA)

        # Trạng thái
        st_val = tracker.state if not is_paused else "PAUSED"
        if is_paused:
            st_color = (0, 255, 255)
        elif tracker.state == 'READY':
            st_color = (0, 255, 0)
        elif tracker.state == 'IN_REP':
            st_color = (0, 165, 255)
        elif tracker.state == 'CHỜ TOÀN THÂN':
            st_color = (0, 200, 255)
        else:
            st_color = (180, 180, 180)

        frame = draw_vietnamese_text(frame, f"[{st_val}]", (w - 240, 44), font_size=19, color_bgr=st_color)

        # FPS
        cv2.putText(frame, f"FPS: {fps:.1f}", (w - 110, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1, cv2.LINE_AA)

        # Banner cảnh báo & hướng dẫn lùi lại khi camera chưa thấy đủ toàn thân
        if track_info.get('need_full_body') or tracker.state == 'CHỜ TOÀN THÂN':
            overlay_b = frame.copy()
            cv2.rectangle(overlay_b, (20, 80), (w - 20, 126), (15, 20, 40), -1)
            cv2.addWeighted(overlay_b, 0.85, frame, 0.15, 0, frame)
            cv2.rectangle(frame, (20, 80), (w - 20, 126), (0, 180, 255), 2)
            banner_msg = "⚠️ VUI LÒNG LÙI LẠI 2 - 3M: Hãy đứng lùi xa để camera thấy rõ từ đầu đến chân!"
            frame = draw_vietnamese_text(frame, banner_msg, (40, 90), font_size=20, color_bgr=(0, 220, 255))

        # ---------------- BẢNG LỊCH SỬ REP GẦN NHẤT (Bottom Card) ----------------
        res = tracker.last_result
        if res is not None:
            is_corr = res['is_correct']
            badge_color = (0, 220, 0) if is_corr else (0, 100, 255)
            badge_title = "ĐÚNG CHUẨN KỸ THUẬT" if is_corr else f"CHƯA ĐÚNG: {res['class_name_vi'].upper()}"

            cv2.rectangle(frame, (20, h - 120), (w - 20, h - 10), badge_color, 2)
            view_tag = f" | {res.get('camera_view_vi', '')}" if res.get('camera_view_vi') else ""
            res_header = f"Rep #{tracker.rep_count}: {badge_title}{view_tag} | Tin cậy: {res['confidence']*100:.1f}% | ONNX: {res['latency_ms']} ms"
            frame = draw_vietnamese_text(frame, res_header, (35, h - 110), font_size=20, color_bgr=badge_color)

            feedback_str = f"HLV: {res['feedback_vi']}"
            if res.get('view_note'):
                feedback_str += f" ({res['view_note']})"
            frame = draw_vietnamese_text(frame, feedback_str, (35, h - 68), font_size=17, color_bgr=(240, 240, 240))
        else:
            hint_str = "Hệ thống đang quét chuyển động... Khi 1 rep hoàn tất, thông báo trạng thái sẽ bật lên ngay!"
            frame = draw_vietnamese_text(frame, hint_str, (35, h - 75), font_size=19, color_bgr=(180, 180, 180))

        # ---------------- POPUP THÔNG BÁO TO NỔI BẬT Ở GIỮA MÀN HÌNH ----------------
        if active_alert and now < active_alert['expire_time']:
            box_x1, box_x2 = int(w * 0.08), int(w * 0.92)
            box_y1, box_y2 = int(h * 0.16), int(h * 0.50)

            modal_overlay = frame.copy()
            bg_tint = (15, 45, 15) if active_alert['is_correct'] else (15, 15, 55)
            cv2.rectangle(modal_overlay, (box_x1, box_y1), (box_x2, box_y2), bg_tint, -1)
            cv2.addWeighted(modal_overlay, 0.88, frame, 0.12, 0, frame)

            border_color = (0, 255, 50) if active_alert['is_correct'] else (0, 60, 255)
            cv2.rectangle(frame, (box_x1, box_y1), (box_x2, box_y2), border_color, 4)

            remain_ratio = max(0.0, (active_alert['expire_time'] - now) / alert_duration)
            prog_x2 = box_x1 + int((box_x2 - box_x1) * remain_ratio)
            cv2.rectangle(frame, (box_x1, box_y2 - 6), (prog_x2, box_y2), border_color, -1)

            view_str = active_alert.get('camera_view_vi', '')
            if active_alert['is_correct']:
                title_text = f"✓ REP #{active_alert['rep_num']}: ĐÚNG CHUẨN KỸ THUẬT! (CORRECT)"
                frame = draw_vietnamese_text(frame, title_text, (box_x1 + 30, box_y1 + 20), font_size=28, color_bgr=(0, 255, 100))
                sub_text = "Phong độ rất tốt! Giữ vững biên độ và kỹ thuật chuẩn này ở rep tiếp theo."
                frame = draw_vietnamese_text(frame, sub_text, (box_x1 + 30, box_y1 + 70), font_size=22, color_bgr=(255, 255, 255))
                
                note_y = box_y1 + 115
                if active_alert.get('view_note'):
                    note_text = f"💡 {active_alert['view_note']}"
                    frame = draw_vietnamese_text(frame, note_text, (box_x1 + 30, note_y), font_size=18, color_bgr=(100, 230, 255))
                    note_y += 32
                
                stat_text = f"Độ tin cậy: {active_alert['confidence']*100:.1f}%  |  Góc: {view_str}  |  ONNX: {active_alert['latency_ms']} ms"
                frame = draw_vietnamese_text(frame, stat_text, (box_x1 + 30, note_y), font_size=17, color_bgr=(200, 255, 200))
            else:
                title_text = f"✗ REP #{active_alert['rep_num']}: CHƯA ĐÚNG! LỖI: {active_alert['class_name_vi'].upper()}"
                frame = draw_vietnamese_text(frame, title_text, (box_x1 + 30, box_y1 + 20), font_size=27, color_bgr=(0, 80, 255))
                fix_title = f"👉 CẦN SỬA: {active_alert['feedback_vi']}"
                frame = draw_vietnamese_text(frame, fix_title, (box_x1 + 30, box_y1 + 70), font_size=21, color_bgr=(255, 240, 220))
                
                note_y = box_y1 + 115
                if active_alert.get('view_note'):
                    note_text = f"💡 {active_alert['view_note']}"
                    frame = draw_vietnamese_text(frame, note_text, (box_x1 + 30, note_y), font_size=18, color_bgr=(255, 200, 100))
                    note_y += 32

                stat_text = f"Độ tin cậy lỗi: {active_alert['confidence']*100:.1f}%  |  Góc: {view_str}  |  ONNX: {active_alert['latency_ms']} ms"
                frame = draw_vietnamese_text(frame, stat_text, (box_x1 + 30, note_y), font_size=17, color_bgr=(180, 180, 255))

        cv2.imshow(window_name, frame)

        # Xử lý phím bấm
        delay_ms = 1 if input_source == 'webcam' else 25
        key = cv2.waitKey(delay_ms) & 0xFF

        if key in [ord('q'), ord('Q'), 27]:
            break
        elif key in [ord('v'), ord('V')]:
            # Mở hộp thoại chọn video từ máy tính
            chosen = pick_video_file()
            if chosen and os.path.exists(chosen):
                cap.release()
                input_source = 'video'
                video_path = chosen
                cap = cv2.VideoCapture(video_path)
                tracker.reset()
                active_alert = None
                is_paused = False
                print(f">>> ĐÃ CHUYỂN SANG PHÁT VIDEO: {chosen}")
        elif key in [ord('c'), ord('C')]:
            # Chuyển về Webcam
            cap.release()
            input_source = 'webcam'
            video_path = None
            cap = cv2.VideoCapture(0)
            tracker.reset()
            active_alert = None
            is_paused = False
            print(">>> ĐÃ CHUYỂN VỀ WEBCAM CAMERA 0")
        elif key in [ord('p'), ord('P')]:
            # Tạm dừng / Tiếp tục
            is_paused = not is_paused
            print(f">>> Trạng thái phát: {'TẠM DỪNG' if is_paused else 'TIẾP TỤC'}")
        elif key in [ord(str(i)) for i in range(1, len(EXERCISES_LIST) + 1)]:
            idx = int(chr(key)) - 1
            current_ex_key = EXERCISES_LIST[idx][1]
            tracker.reset(current_ex_key)
            active_alert = None
            print(f">>> Đã chọn bài tập: {EXERCISE_CONFIG[current_ex_key]['name_vi']}")
        elif key in [ord('m'), ord('M')]:
            SOUND_ENABLED = not SOUND_ENABLED
            print(f">>> Âm thanh thông báo: {'BẬT' if SOUND_ENABLED else 'TẮT'}")
        elif key in [ord('r'), ord('R')]:
            if input_source == 'video':
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            tracker.reset()
            active_alert = None
            print(">>> Đã reset số Reps và phát lại từ đầu.")
        elif key in [ord('l'), ord('L')]:
            logger.open_folder()
        elif key == 32:  # Phím Spacebar
            if input_source == 'video':
                is_paused = not is_paused
            else:
                forced = tracker.force_evaluate_current_buffer()
                if forced:
                    forced_res, rep_32 = forced
                    is_corr = forced_res['is_correct']
                    active_alert = {
                        'rep_num': tracker.rep_count,
                        'is_correct': is_corr,
                        'class_name_vi': forced_res['class_name_vi'],
                        'feedback_vi': forced_res['feedback_vi'],
                        'confidence': forced_res['confidence'],
                        'latency_ms': forced_res['latency_ms'],
                        'camera_view_vi': forced_res.get('camera_view_vi', ''),
                        'view_note': forced_res.get('view_note', ''),
                        'biomechanics': forced_res.get('biomechanics', {}),
                        'expire_time': now + alert_duration,
                        'start_time': now
                    }
                    play_audio_feedback(is_corr)
                    src_name = os.path.basename(video_path) if (input_source == 'video' and video_path) else 'Webcam PC'
                    logger.log_rep(
                        rep_num=tracker.rep_count,
                        exercise=current_ex_key,
                        eval_res=forced_res,
                        rep_tensor=rep_32,
                        raw_frame_count=tracker.last_raw_frames_count,
                        source_name=src_name
                    )
                    print(f"📁 [ĐÃ LƯU LOG CHI TIẾT]: {logger.csv_path}")

    cap.release()
    cv2.destroyAllWindows()

    stats = logger.get_summary_stats()
    print("\n" + "=" * 80)
    print("         BÁO CÁO TỔNG KẾT PHIÊN TEST (SESSION EXERCISE LOG SUMMARY)")
    print("=" * 80)
    print(f"  • Tổng số Reps đã tập/test: {stats['total_reps']}")
    print(f"  • Số Reps đúng kỹ thuật:   {stats['correct_reps']}")
    print(f"  • Số Reps phát hiện lỗi:   {stats['error_reps']}")
    print(f"  • Tỷ lệ chuẩn form:        {stats['accuracy']:.1f}%")
    print(f"  • File tóm tắt bảng CSV:   {stats['csv_path']}")
    print(f"  • File chi tiết JSONL:     {stats['jsonl_path']}")
    print(f"  • Thư mục lưu tọa độ .npy: {stats['session_dir']}\\tensors\\")
    print("=" * 80)
    print(">>> Ứng dụng đã đóng thành công.")



if __name__ == '__main__':
    main()
