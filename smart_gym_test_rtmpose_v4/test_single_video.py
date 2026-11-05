"""Kiểm thử toàn bộ nhãn squat, kèm JSON và ảnh bảng đối chiếu."""
import sys
from app import main
if __name__ == '__main__':
    if '--video' not in sys.argv:
        from app import pick_video_file
        chosen=pick_video_file()
        if not chosen:raise SystemExit('Chưa chọn video')
        sys.argv.extend(['--video',chosen])
    if '--headless' not in sys.argv:sys.argv.append('--headless')
    main()
