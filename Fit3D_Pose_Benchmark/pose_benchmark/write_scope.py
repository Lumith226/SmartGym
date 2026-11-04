"""Document available data and criteria that require additional recordings."""
import json
from collections import Counter
from adapters import BASE
from dataset import clips
from generate_report import table

R=BASE/'results_full';D=R/'dataset_audit'
views=json.loads((D/'camera_inventory.json').read_text(encoding='utf-8'))
lines=['# Phạm vi dữ liệu và tiêu chí','',
 'Dự án SmartGym hiện có sáu loại bài: squat, push-up, pull-up, bench press, reverse crunch (khóa `situp`) và jumping jack. `squat_v1` là phiên bản classifier khác cho cùng bài squat, không phải bài mới.','',
 table(['Bài SmartGym','Bài Fit3D dùng','Video có GT/calibration','Quyết định'],[
 ['Squat','squat',32,'Đánh giá đủ 8 người × 4 camera'],
 ['Chống đẩy','pushup',32,'Đánh giá đủ 8 người × 4 camera'],
 ['Hít xà','Không có tên tương ứng',0,'Không dùng động tác kéo tạ thay thế'],
 ['Bench press','Không có tên tương ứng',0,'Không dùng shoulder press thay thế'],
 ['Reverse crunch / situp','Không có tên tương ứng đã xác nhận',0,'Không tự gán một warmup thành reverse crunch'],
 ['Jumping jack','Không có tên tương ứng đã xác nhận',0,'Không tự gán một warmup thành jumping jack']]),'',
 'Đã lập inventory toàn bộ video train đang có trong `training_inventory.json`. Tập test có video nhưng không có khớp 3D ground truth công khai tương ứng ở máy này, nên không được trộn vào bảng accuracy có GT.','',
 '## Rà soát warmup','',
 'Tạo contact sheet 19 warmup của s03, camera 60457274, sáu thời điểm mỗi video. Đây là kiểm tra trực quan trên người đại diện, không phải nhãn động tác chính thức cho toàn bộ người. Metadata chỉ đặt tên `warmup_X`, không cung cấp ánh xạ đã xác nhận sang các bài SmartGym.','',
 'Trong ảnh đại diện, warmup_2/3 có bước chân trước–sau, warmup_17/18/19 có chuyển động tay chéo với tư thế chân rộng; không đủ căn cứ coi đó là jumping jack chuẩn. Không thấy động tác reverse crunch tương ứng trong các ảnh warmup đã rà. Chưa đưa chúng vào benchmark để tránh chấm nhầm bài. Các ảnh bằng chứng được giữ bên dưới.','']
for name in ['warmups_01_05.jpg','warmups_06_10.jpg','warmups_11_15.jpg','warmups_16_19.jpg']:
 lines += [f'![{name}]({name})','']
lines += ['## Camera thực có','',
 'Góc tính từ calibration và MoCap, quy ước theo bài được giải thích trong báo cáo chính. Những camera ghi cùng một người thực hiện cùng một chuyển động; so sánh ghép cặp giữ người và bài cố định. Góc trung bình của cả camera không thay thế góc từng clip.','']
for ex in ['squat','pushup']:
 g=[v for v in views if v['exercise']==ex];counts=Counter(v['view_label_vi'] for v in g)
 lines += [f'### {ex}','',table(['Nhóm góc thực có','Số video'],sorted(counts.items())),'',f'Góc phương vị trong mẫu: {min(v["relative_azimuth_deg"] for v in g):.1f}°–{max(v["relative_azimuth_deg"] for v in g):.1f}°.','']
lines += ['## Mức đáp ứng tiêu chí trong ảnh','',table(['Tiêu chí','Đầu ra','Trạng thái'],[
 ['Vị trí vai/khuỷu/cổ tay/hông/gối/cổ chân','PCK, sai số pixel có phạt mất khớp, bảng 12 khớp','Đã đo'],
 ['Ổn định, mất khớp, nghi đảo trái–phải','Jitter sai số, missing, ứng viên LR confusion','Đã đo; LR là chỉ báo hình học'],
 ['Đủ khớp cần thiết xuyên suốt bài','Tỷ lệ frame đủ 12 khớp đúng','Đã đo; không có nhãn self-occlusion thủ công'],
 ['Tốc độ và độ trễ GPU','FPS, median/p95 pose pipeline','Đã đo; classifier cố định chạy CPU'],
 ['Đếm lượt','Số rep, sai số tuyệt đối, MAE và tỷ lệ clip đếm đúng','Đã đo với tracker cố định'],
 ['Accuracy nhận diện lỗi','N/A; có đồng thuận lớp qua camera','Chưa có nhãn lỗi, người dùng đã xác nhận'],
 ['Chính diện / góc chéo / sau','Camera thật và góc calibration riêng từng bài','Đã đo trên các góc hiện có'],
 ['Chéo khoảng 45°','N/A cho khoảng 45°','Các clip chéo hiện có chỉ lệch khoảng 30–34° so với trục trước/sau'],
 ['Góc ngang 90°','N/A','Không có clip thuộc nhóm ngang 60–120°'],
 ['Che khuất một phần','Thử vật cản nhân tạo, model được chọn theo từng bài','Đã đo riêng, không coi là camera thật mới'],
 ['Camera quá thấp / thay độ cao có kiểm soát','N/A','Không có lần quay lại cùng chuyển động với thay đổi độ cao có kiểm soát']]),'',
 'Để chấm nốt accuracy lỗi cần nhãn lỗi từng rep đã kiểm chứng. Để kết luận về camera ngang hoặc độ cao cần video/calibration tương ứng; không suy ra dữ liệu mới từ việc xoay hoặc cắt ảnh 2D.','']
(D/'SCOPE.md').write_text('\n'.join(lines),encoding='utf-8')
print('Scope documented')
