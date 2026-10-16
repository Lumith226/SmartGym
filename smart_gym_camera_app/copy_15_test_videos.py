"""
TRÍCH XUẤT VÀ SAO CHÉP 15 VIDEO TEST MỖI BÀI TẬP TỪ TẬP 15% TEST (UNSEEN DATA)
- Trích xuất chuẩn xác từ 15% Test Split (Stratified random_state=42)
- Đảm bảo 100% không trùng lặp với tập Train (70%) và Val (15%)
- Đảm bảo cân bằng các lớp lỗi và đúng form (4, 4, 4, 3 = 15 video/bài)
- Sao chép vào smart_gym_camera_app/test_videos_benchmark/
- Tạo bảng catalog chi tiết kèm nhãn gốc Qualcomm
"""

import os
import sys
import json
import shutil
import numpy as np
from sklearn.model_selection import train_test_split

if sys.platform == 'win32' and hasattr(sys.stdout, 'buffer'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BENCHMARK_DIR = os.path.join(CURRENT_DIR, 'test_videos_benchmark')
QUALCOMM_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, '..', 'stgcn_squat_project', 'Dataset', 'Qualcom dataset'))
DATA_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..', 'stgcn_squat_project', 'data'))

PART_DIRS = [
    os.path.join(QUALCOMM_ROOT, 'QEVD-FIT-300k-Part-1'),
    os.path.join(QUALCOMM_ROOT, 'QEVD-FIT-300k-Part-2'),
    os.path.join(QUALCOMM_ROOT, 'QEVD-FIT-300k-Part-3'),
    os.path.join(QUALCOMM_ROOT, 'QEVD-FIT-300k-Part-4', 'QEVD-FIT-300k-Part-4'),
]

EXERCISES = {
    'squat': {
        'name_vi': 'Gánh đùi (Squat)',
        'meta_file': 'metadata_squat_v2.json',
        'dest_folder': os.path.join(BENCHMARK_DIR, 'squats'),
        'classes': ['CORRECT', 'BACK_ROUNDING', 'KNEE_ALIGNMENT', 'SHALLOW_DEPTH'],
        'class_names_vi': {
            'CORRECT': 'Đúng chuẩn form kỹ thuật',
            'BACK_ROUNDING': 'Gù lưng / Đổ thân về trước',
            'KNEE_ALIGNMENT': 'Lỗi trục gối / Chân quá hẹp',
            'SHALLOW_DEPTH': 'Xuống chưa đủ độ sâu'
        },
        'quota': [4, 4, 4, 3]  # Tổng 15
    },
    'pushup': {
        'name_vi': 'Chống đẩy (Push-up)',
        'meta_file': 'metadata_pushup_v2.json',
        'dest_folder': os.path.join(BENCHMARK_DIR, 'pushups'),
        'classes': ['CORRECT', 'SHALLOW_DEPTH', 'HIP_ALIGNMENT', 'HAND_PLACEMENT'],
        'class_names_vi': {
            'CORRECT': 'Đúng chuẩn form kỹ thuật',
            'SHALLOW_DEPTH': 'Xuống chưa đủ độ sâu',
            'HIP_ALIGNMENT': 'Lệch hông / Võng lưng sụp hông',
            'HAND_PLACEMENT': 'Đặt tay quá rộng hoặc hẹp'
        },
        'quota': [4, 4, 4, 3]  # Tổng 15
    },
    'jump_jack': {
        'name_vi': 'Bật nhảy (Jumping Jack)',
        'meta_file': 'metadata_jumpjack_v2.json',
        'dest_folder': os.path.join(BENCHMARK_DIR, 'jumping_jacks'),
        'classes': ['CORRECT', 'ARMS_INCOMPLETE', 'LEGS_TOO_NARROW', 'NOT_JUMPING'],
        'class_names_vi': {
            'CORRECT': 'Đúng chuẩn form kỹ thuật',
            'ARMS_INCOMPLETE': 'Tay vỗ chưa tới đỉnh đầu',
            'LEGS_TOO_NARROW': 'Chân mở chưa đủ rộng',
            'NOT_JUMPING': 'Không bật nhảy'
        },
        'quota': [4, 4, 4, 3]  # Tổng 15
    },
    'crunch': {
        'name_vi': 'Gập bụng ngược (Reverse Crunch)',
        'meta_file': 'metadata_crunch_v2.json',
        'dest_folder': os.path.join(BENCHMARK_DIR, 'reverse_crunches'),
        'classes': ['CORRECT', 'SHALLOW_RANGE', 'NOT_RAISING_HIPS', 'HEAD_STRAIN'],
        'class_names_vi': {
            'CORRECT': 'Đúng chuẩn form kỹ thuật',
            'SHALLOW_RANGE': 'Co gối chưa đủ góc 90°',
            'NOT_RAISING_HIPS': 'Chưa nâng hông tách sàn',
            'HEAD_STRAIN': 'Gồng bẻ đốt sống cổ / Đè đầu'
        },
        'quota': [4, 4, 4, 3]  # Tổng 15
    }
}


def build_video_map():
    print(">>> Đang quét lập chỉ mục 298k video từ Qualcomm Part 1-4...")
    vmap = {}
    for pd in PART_DIRS:
        if not os.path.exists(pd):
            continue
        for fname in os.listdir(pd):
            if fname.lower().endswith(('.mp4', '.avi', '.mov')):
                if fname not in vmap:
                    vmap[fname] = os.path.join(pd, fname)
    print(f">>> Đã quét xong {len(vmap)} tệp video.")
    return vmap


def main():
    vmap = build_video_map()
    catalog = {}
    catalog_md_rows = []

    total_copied = 0

    for ex_key, ex_info in EXERCISES.items():
        print("\n" + "=" * 80)
        print(f"XỬ LÝ BÀI TẬP: {ex_info['name_vi'].upper()}")
        print("=" * 80)

        meta_path = os.path.join(DATA_DIR, ex_info['meta_file'])
        if not os.path.exists(meta_path):
            print(f"[ERROR] Không tìm thấy metadata: {meta_path}")
            continue

        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)

        y = np.array([m['label_id'] for m in meta])
        indices = np.arange(len(meta))

        # Tách Stratified 70% Train, 15% Val, 15% Test
        _, temp_idx, _, y_temp = train_test_split(indices, y, test_size=0.30, random_state=42, stratify=y)
        _, test_idx, _, y_test = train_test_split(temp_idx, y_temp, test_size=0.50, random_state=42, stratify=y_temp)

        print(f">>> Tổng số mẫu trong 15% Test set: {len(test_idx)} clips")

        os.makedirs(ex_info['dest_folder'], exist_ok=True)
        existing_files = set(os.listdir(ex_info['dest_folder']))

        # Nhóm index theo class
        class_samples = {i: [] for i in range(len(ex_info['classes']))}
        for idx in test_idx:
            cid = meta[idx]['label_id']
            class_samples[cid].append(meta[idx])

        selected_for_ex = []
        for cid, quota in enumerate(ex_info['quota']):
            c_name = ex_info['classes'][cid]
            candidates = class_samples[cid]
            added = 0
            for item in candidates:
                vname = item['video']
                # Kiểm tra video có trên đĩa không
                if vname not in vmap:
                    continue
                # Đặt tên mới có tiền tố nhãn
                target_filename = f"{c_name}_{vname}"
                if target_filename in existing_files:
                    continue

                src_path = vmap[vname]
                dst_path = os.path.join(ex_info['dest_folder'], target_filename)

                shutil.copy2(src_path, dst_path)
                added += 1
                total_copied += 1

                file_size_mb = os.path.getsize(dst_path) / (1024 * 1024)

                record = {
                    'exercise': ex_key,
                    'exercise_vi': ex_info['name_vi'],
                    'filename': target_filename,
                    'original_video': vname,
                    'class_name': c_name,
                    'class_name_vi': ex_info['class_names_vi'][c_name],
                    'label_id': cid,
                    'raw_labels': item.get('raw_labels', []),
                    'dest_path': dst_path,
                    'file_size_mb': round(file_size_mb, 2)
                }
                selected_for_ex.append(record)
                catalog_md_rows.append(record)

                if added >= quota:
                    break
            print(f"  • Lớp [{cid}] {c_name:16s}: Đã trích xuất {added}/{quota} video.")

        catalog[ex_key] = selected_for_ex
        print(f">>> Đã sao chép thành công {len(selected_for_ex)} video vào: {ex_info['dest_folder']}")

    # Lưu Catalog ra JSON
    catalog_json_path = os.path.join(BENCHMARK_DIR, 'catalog_15_test_videos.json')
    with open(catalog_json_path, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    # Lưu Catalog ra Markdown
    catalog_md_path = os.path.join(BENCHMARK_DIR, 'DANH_SACH_VIDEO_TEST_BO_SUNG.md')
    with open(catalog_md_path, 'w', encoding='utf-8') as f:
        f.write("# DANH SÁCH 60 VIDEO TEST BỔ SUNG TỪ TẬP 15% TEST (QUALCOMM UNSEEN DATA)\n\n")
        f.write("> **Lưu ý:** Toàn bộ 60 video này được trích xuất từ tập 15% Test Split (Stratified `random_state=42`).\n")
        f.write("> Mô hình ST-GCN++ **hoàn toàn chưa từng nhìn thấy** các video này trong quá trình huấn luyện và tinh chỉnh.\n\n")
        f.write("| STT | Bài tập | Tên file video | Nhãn chuẩn (Qualcomm Ground-Truth) | Ý nghĩa lỗi | Dung lượng |\n")
        f.write("| :-: | :--- | :--- | :--- | :--- | :-: |\n")
        for i, row in enumerate(catalog_md_rows, 1):
            f.write(f"| {i} | {row['exercise_vi']} | `{row['filename']}` | **{row['class_name']}** | {row['class_name_vi']} | {row['file_size_mb']} MB |\n")

    print("\n" + "=" * 80)
    print(f"✓ HOÀN THÀNH: ĐÃ TRÍCH XUẤT VÀ SAO CHÉP {total_copied} VIDEO TEST MỚI!")
    print(f"  • Thư mục lưu: {BENCHMARK_DIR}")
    print(f"  • Tệp danh mục JSON: {catalog_json_path}")
    print(f"  • Tệp danh mục Markdown: {catalog_md_path}")
    print("=" * 80)


if __name__ == '__main__':
    main()
