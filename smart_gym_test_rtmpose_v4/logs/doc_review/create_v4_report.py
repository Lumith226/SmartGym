"""Build a Vietnamese V4 review from final artifacts; never retrain or edit inputs."""
from pathlib import Path
import json
import re
import hashlib
import numpy as np
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'stgcn_model_training/outputs/v4'
DOC = ROOT / 'DOC'
STEM = 'Bao_cao_Tong_hop_V4_va_So_sanh_V3'
def read(path):
    return json.loads(path.read_text(encoding='utf-8'))
reports = {e: read(OUT/f'test_report_{e}_v4_multihead.json') for e in ('squat','jumpjack')}
contracts = {e: read(ROOT/f'stgcn_model_training/models/v4/{e}_v4_contract.json') for e in reports}
histories = {e: read(OUT/f'training_history_{e}_v4.json') for e in reports}
def pct(x):
    return f'{x*100:.2f}%'
def table(headers, rows):
    def line(row):
        return '| ' + ' | '.join(str(x).replace('|','/') for x in row) + ' |'
    return '\n'.join([line(headers),line(['---']*len(headers))]+[line(r) for r in rows])
def image(name, caption):
    assert (OUT/name).is_file(), name
    return f'![{caption}](../stgcn_model_training/outputs/v4/{name})\n\n*{caption}*'


parts=[r"""# BÁO CÁO TỔNG HỢP KẾT QUẢ VÀ CÁC CẢI TIẾN SMART GYM V4

Ngày báo cáo: 24/10/2026

## 1. Mục tiêu của phiên bản V4

V4 tập trung vào nhận diện đồng thời nhiều lỗi và đặc điểm chuyển động trong bài squat và jumping jacks (bật nhảy dang tay chân). Thay vì chọn một lớp chính cho mỗi video, mô hình đánh giá riêng từng nhãn. Cách tổ chức này phù hợp với trường hợp người tập vừa xuống nông, vừa có vấn đề về lưng hoặc khoảng cách chân.

Hai thay đổi chính là giữ chi tiết các nhãn Qualcomm và bổ sung thông tin về biên độ, thời gian, nhịp chuyển động vào quá trình học. Squat có 14 nhãn; jumping jacks có 29 nhãn. Kết quả được trình bày theo từng nhãn để xác định tiêu chí nào nhận diện tốt và tiêu chí nào cần cải thiện.

## 2. Thay đổi qua các phiên bản V2, V3 và V4

| Nội dung | V2 | V3 | V4 |
|---|---|---|---|
| Hướng xử lý chính | Phân loại bốn lớp với các bước hiệu chỉnh khớp | Giảm can thiệp nắn khớp, dùng RTMPose (mô hình ước lượng khớp) và điều chỉnh phân đoạn chuyển động | Chuyển sang nhận diện nhiều nhãn cho squat và jumping jacks |
| Cách biểu diễn kết quả | Một lớp chính: đúng hoặc một nhóm lỗi | Một lớp chính, có thể bổ sung cảnh báo lỗi phụ | Điểm và quyết định riêng cho 14/29 nhãn |
| Chuỗi đầu vào | 32 khung mẫu | 32 khung mẫu, tập trung đoạn chuyển động | 64 khung mẫu squat; 128 khung mẫu jumping jacks, giữ ngữ cảnh cả đoạn |
| Thông tin dùng để học | Chuỗi khớp đã xử lý | Chuỗi khớp giảm nắn chỉnh cứng | Chuỗi khớp kết hợp 16/32 đặc trưng bổ sung |
| Cách học nhãn | Mỗi mẫu có một lớp mục tiêu | Mỗi mẫu có một lớp mục tiêu | Một mẫu có thể đồng thời mang nhiều nhãn mục tiêu |
| Cách quyết định | Ưu tiên lớp điểm cao nhất | Ưu tiên lớp điểm cao nhất, kèm xử lý hiển thị | So sánh từng điểm với ngưỡng riêng |
| Đánh giá chính | Tỷ lệ phân loại đúng một lớp | Tỷ lệ phân loại đúng một lớp và kết quả từng lớp | F1 theo nhãn, khớp toàn bộ nhãn và ma trận 2×2 từng nhãn |

V3 có thể hiển thị thêm lỗi phụ, nhưng mô hình vẫn được huấn luyện theo một lớp chính. V4 thay đổi ngay từ mục tiêu huấn luyện: một video có nhiều nhãn thì nhiều đầu ra cùng được học là có. Nhờ đó, các lỗi không phải cạnh tranh để chỉ giữ lại một lỗi duy nhất.

## 3. Dữ liệu Qualcomm và ý nghĩa của nhãn

### 3.1. Cách xây dựng dữ liệu

Biến thể được xây dựng với huấn luyện viên; người tham gia làm theo hướng dẫn và video mẫu. Video cùng nhãn được kiểm tra lại. [1]

Trang dữ liệu Qualcomm xác nhận mỗi video có một hoặc nhiều nhãn theo dạng “bài tập – thuộc tính chi tiết”. [2] Vì vậy, số nhãn thay đổi giữa các video là đặc điểm được hỗ trợ trong dữ liệu; không thể dựa vào việc chỉ có một nhãn để kết luận video bị gán thiếu.

### 3.2. Nhãn lỗi, nhãn thuộc tính và nhãn trạng thái

Trong dữ liệu, labels (mã nhãn) đi kèm labels_descriptive (mô tả nhãn). Báo cáo sử dụng hai trường này để diễn giải kết quả, thay vì coi mọi nhãn đều là một lỗi.

| Mã nhãn squat | Diễn giải theo dữ liệu | Cách hiểu trong đánh giá |
|---|---|---|
| no obvious issue (không thấy vấn đề rõ ràng) | Không ghi nhận vấn đề rõ ràng | Nhận xét thuận lợi về đoạn tập; không mở rộng thành khẳng định mọi tiêu chí đều đúng |
| 90 degrees (90 độ) | Người tập hạ xuống đến 90 độ | Thuộc tính về độ sâu động tác |
| shoulder-width (rộng bằng vai) | Hai chân mở rộng bằng vai | Thuộc tính về khoảng cách chân |
| shallow (xuống nông) | Động tác squat xuống quá nông | Nhãn lỗi về độ sâu |
| back not straight (lưng không thẳng) | Lưng người tập không thẳng | Nhãn lỗi về tư thế lưng |
| narrow (chân hẹp) | Chân và bàn chân đặt quá gần nhau | Nhãn về khoảng cách chân hẹp |
| hold (giữ tư thế) | Giữ tư thế trong đoạn tập | Trạng thái chuyển động |
| starting late (bắt đầu muộn) | Bắt đầu chuyển động muộn | Trạng thái cần quan sát cả đoạn |

Một video có thể đồng thời mô tả độ sâu và khoảng cách chân. Nhãn “90 độ” hoặc “rộng bằng vai” không phải kết luận toàn bộ động tác đúng; tương tự, có nhãn “xuống nông” không có nghĩa các tiêu chí còn lại đã được xác nhận đúng.

Với jumping jacks, các nhãn gồm chuyển động chỉ tay hoặc chỉ chân, không bật nhảy, ngược pha, không đồng bộ, mức biên độ và tốc độ. Phụ lục C.1 mô tả cách tạo một số nhãn định lượng: so sánh từng cặp video, xếp thứ tự rồi chia nhóm. [1] Vì vậy, ROM — range of motion (biên độ vận động) trong báo cáo được giữ theo thang dữ liệu, không tự đổi thành số độ góc.

### 3.3. Cách sử dụng nhãn trong V4

Mỗi video squat được biểu diễn bằng 14 vị trí nhãn, jumping jacks bằng 29 vị trí. Nhãn có trong danh sách được ghi là 1; nhãn không có được ghi là 0. Video chỉ có một nhãn vẫn được đưa vào huấn luyện bình thường.

Ví dụ video có nhãn “xuống nông” và “lưng không thẳng” sẽ có cả hai vị trí bằng 1. Mô hình được học để tăng điểm của hai nhãn này và giảm điểm những nhãn còn lại. Đây là cách triển khai học nhiều nhãn của V4, không phải khẳng định bài báo Qualcomm dùng cùng mô hình hoặc cùng hàm sai số.

Dữ liệu có hướng dẫn và bước kiểm tra nhãn, nên không nên mặc định chú thích chỉ là yêu cầu quay chưa được xác nhận. Khi đánh giá, nhãn Qualcomm được dùng làm đáp án chuẩn. Tuy nhiên, việc không có một nhãn không được diễn giải thêm thành kết luận kỹ thuật hoặc y khoa về tất cả tiêu chí còn lại.

## 4. Dữ liệu sử dụng và phân chia các tập

Tệp dữ liệu có 298.089 bản ghi video, trong đó 297.912 video có ít nhất một nhãn và 177 video có danh sách nhãn rỗng. Hai mô hình sử dụng các video có nhãn phù hợp với từng bài. Số video thực tế trong các tập như sau:

| Tập dữ liệu | Squat | Jumping jacks | Tổng |
|---|---:|---:|---:|
| Train (huấn luyện) | 3.463 | 2.494 | 5.957 |
| Validation (xác thực) | 610 | 439 | 1.049 |
| Test (kiểm tra) | 215 | 306 | 521 |
| Tổng số video sử dụng trong ba tập | 4.288 | 3.239 | 7.527 |

Tập huấn luyện dùng để cập nhật trọng số. Tập xác thực dùng để chọn mô hình và ngưỡng. Tập kiểm tra dùng để đánh giá sau khi hoàn tất lựa chọn. Các tập được tách theo video và kiểm tra trùng nội dung; chưa đánh giá riêng khả năng nhận diện trên nhóm người hoàn toàn khác.

## 5. Các thay đổi trong mô hình và huấn luyện

### 5.1. Tăng thông tin về chuyển động

V4 dùng 64 khung mẫu cho squat và 128 khung mẫu cho jumping jacks. Các khung được lấy trên cả đoạn, không yêu cầu video phải có đúng số khung này. Việc giữ cả đoạn giúp mô hình quan sát thêm thời gian bắt đầu, khoảng giữ tư thế và sự thay đổi nhịp tập.

Ngoài chuỗi 17 khớp, squat bổ sung 16 đặc trưng và jumping jacks bổ sung 32 đặc trưng. Các đặc trưng mô tả độ sâu, khoảng cách chân, biên độ, thời lượng và mức chuyển động. Jumping jacks có thêm mức phối hợp tay–chân và nhịp lặp. Có thể hiểu đây là cách cung cấp thêm thông tin tóm tắt để mô hình học cùng chuỗi khớp, thay vì tự đặt luật kết luận lỗi từ một góc đo.

ST-GCN++ (mạng đồ thị không gian và thời gian) học quan hệ giữa các khớp và cách chúng thay đổi theo thời gian. Đặc trưng học được được ghép với thông tin bổ sung để tính điểm từng nhãn. Đầu ra squat có 14 điểm; jumping jacks có 29 điểm.

### 5.2. Học đồng thời các nhãn

V4 dùng weighted binary cross-entropy (sai số nhị phân có trọng số). Có thể hiểu: nếu video có một nhãn mà mô hình cho điểm thấp, mô hình cần tăng điểm nhãn đó; nếu không có nhãn mà mô hình cho điểm cao, mô hình cần giảm điểm. Sai số của các nhãn được tổng hợp để điều chỉnh mạng.

Các nhãn xuất hiện ít được điều chỉnh mức đóng góp trong quá trình học nhằm giảm ảnh hưởng của chênh lệch số lượng mẫu. Trọng số chỉ tính từ dữ liệu huấn luyện. Cách này hỗ trợ xử lý mất cân bằng nhưng không thay thế được việc bổ sung dữ liệu khi một nhãn chỉ có vài video.

| Thiết lập | Giá trị sử dụng |
|---|---|
| Số vòng học tối đa | 70 |
| Batch size (số video trong mỗi lô) | 32 |
| AdamW (thuật toán cập nhật trọng số) | Tốc độ học ban đầu 0,001, giảm dần trong quá trình học |
| Tăng cường dữ liệu | Đối xứng trái–phải và nhiễu tọa độ nhỏ |
| Chọn mô hình | AP trung bình trên các nhãn có mẫu dương ở tập xác thực |
| Early stopping (dừng sớm) | Dừng khi chỉ số chọn mô hình không cải thiện trong 16 vòng liên tiếp |

### 5.3. Chọn ngưỡng cho từng nhãn

Điểm đầu ra chưa phải quyết định cuối. V4 thử các mốc từ 10% đến 90% trên tập xác thực và chọn riêng mốc cho từng nhãn theo F1 (điểm cân bằng giữa báo đúng và tìm đủ nhãn). Sau đó, các mốc được giữ cố định khi kiểm tra. Nguyên tắc điều chỉnh ngưỡng theo chỉ số đánh giá được trình bày trong tài liệu scikit-learn. [3]

Ngưỡng thấp hơn làm mô hình dễ báo nhãn hơn nhưng có thể tăng báo thừa. Ngưỡng cao hơn giảm số lần báo nhưng có thể tăng bỏ sót. Vì điểm và số mẫu khác nhau giữa các nhãn, dùng chung 50% chưa chắc cho kết quả phù hợp nhất.

Ví dụ, ngưỡng nhãn xuống nông là 57,5%, lưng không thẳng là 32,5%. Nếu một video có điểm lần lượt 80% và 60%, mô hình báo cả hai nhãn. Các điểm này được xét độc lập, không cần cộng thành 100%. Điểm 80% cũng chưa được kiểm chứng để hiểu là kết luận đúng với xác suất 80%.

Nhãn thiếu mẫu xác thực để chọn ngưỡng được đánh dấu chưa đủ dữ liệu và chưa tự động báo có. Việc mô hình có đầu ra cho một nhãn chưa đồng nghĩa nhãn đó đã đủ điều kiện sử dụng tin cậy.

## 6. Kết quả đánh giá V4

### 6.1. Kết quả tổng hợp trên tập kiểm tra
"""]
parts.append(table(['Bài tập','Số video','F1 gộp','F1 trung bình các nhãn','Khớp toàn bộ nhãn'],[
 ['Squat' if e=='squat' else 'Jumping jacks',r['test']['samples'],pct(r['test']['micro_f1']),pct(r['test']['macro_f1']),pct(r['test']['exact_match'])]
 for e,r in reports.items()]))
parts.append(r"""
Micro F1 (F1 gộp) cho biết kết quả khi tổng hợp các quyết định nhãn. Macro F1 (F1 trung bình đều các nhãn) giúp quan sát mức đồng đều: mỗi nhãn có vai trò như nhau trong phép lấy trung bình. Khớp toàn bộ yêu cầu video được dự đoán đúng đủ danh sách nhãn, không thiếu và không thừa.

Squat có 69/215 video khớp toàn bộ, jumping jacks có 167/306. Nếu video có ba nhãn mà chỉ nhận đúng hai nhãn, video đó chưa được tính là khớp toàn bộ nhưng vẫn có đóng góp nhận đúng trong F1. Đây là lý do tỷ lệ khớp toàn bộ thấp hơn F1 gộp.

F1 trung bình trong bảng tính trên đủ 14/29 nhãn. Khi một nhãn không có mẫu dương trong tập kiểm tra, báo cáo quy ước F1 bằng 0. Nếu chỉ tính các nhãn có mẫu dương, squat đạt 73,68% trên 13 nhãn; jumping jacks đạt 61,79% trên 25 nhãn. Khi sử dụng số liệu cần ghi rõ cách tính trung bình.

### 6.2. Nhận xét khi đối chiếu V3 và V4

V3 ghi nhận Accuracy (tỷ lệ chọn đúng một lớp) là 71,53% cho squat và 88,17% cho jumping jacks. Các số này không so trực tiếp với F1 của V4 vì hai phiên bản khác số nhãn và cách đánh giá. V4 giải quyết bài toán chi tiết hơn, trong đó một video có thể đồng thời mang nhiều đặc điểm.

Cải thiện rõ nhất là mô hình có thể học và trả nhiều nhãn cùng lúc. Mức tăng độ chính xác so với V3 cần được đánh giá trên cùng bộ video và cùng nhóm nhãn; chưa có cơ sở quy đổi trực tiếp thành số điểm phần trăm tăng hoặc giảm.

## 7. Kết quả từng nhãn và nhận xét

### 7.1. Squat
""")
for e in reports:
 if e=='jumpjack':parts.append('### 7.2. Jumping jacks')
 parts.append(table(['Nhãn','Precision (độ chuẩn xác)','Recall (độ bao phủ)','F1','Số video có nhãn'],[
  [v['name_vi'],pct(v['precision']),pct(v['recall']),pct(v['f1']),v['support']]
  for v in reports[e]['test']['per_label'].values()]))
 if e=='squat':
  parts.append('Squat có kết quả khá hơn ở chân rộng bằng vai (F1 88,64%), chân hẹp (83,64%) và biên độ chưa đủ (81,69%). Các nhãn lưng không thẳng (66,67%), xuống nông (60,98%) và gập gối vượt 90° (55,88%) còn nhầm lẫn. Bắt đầu muộn đạt 100% nhưng chỉ có 15 mẫu; giữ tư thế đạt 94,12% với 9 mẫu. Các điểm cao trên ít mẫu cần được kiểm tra thêm trước khi đánh giá khả năng sử dụng rộng rãi.')
 else:
  parts.append('Jumping jacks nhận diện tốt hơn các chuyển động khác biệt rõ: chỉ chuyển động tay đạt 98,36%, chỉ chuyển động chân 100%, không bật nhảy 98,04%, ngược pha 86,15%. Ngược lại, không đồng bộ chỉ đạt 26,67%; một số mức biên độ trung gian có F1 bằng 0 dù có mẫu kiểm tra. Kết quả cho thấy mô hình phân biệt được nhiều nhóm chuyển động chính nhưng chưa ổn định ở khác biệt nhỏ về biên độ và phối hợp.')
parts.append(r"""
### 7.3. Những nhãn cần lưu ý

Ba nhãn jumping jacks chưa có mẫu dương xác thực gồm chân mức biên độ 1,5; chân mức 3,5; tốc độ 1,75 lần/giây. Số mẫu huấn luyện tương ứng chỉ là 2, 2 và 1. Các nhãn này chưa tự động báo có. Tốc độ 0,25 lần/giây không có mẫu dương kiểm tra nên chưa đo được khả năng tìm thấy trên tập này.

Với squat, nhãn không nhìn thấy rõ không có mẫu dương trong tập kiểm tra. Riêng mã “knees over toes” có mô tả đi kèm “knees don't go past their toes”, nên hai trường đang trái nghĩa. Báo cáo giữ chú thích mâu thuẫn, không tự đổi nhãn sang một kết luận kỹ thuật khác.

## 8. Giải thích bảng và biểu đồ

### 8.1. Bảng kết quả từng nhãn

Precision (độ chuẩn xác) trả lời: trong những video mô hình báo một nhãn, bao nhiêu video khớp nhãn chuẩn? Recall (độ bao phủ) trả lời: trong những video có nhãn chuẩn đó, mô hình tìm được bao nhiêu? F1 tổng hợp hai mặt này. Support (số mẫu có nhãn) cho biết số video làm căn cứ đánh giá.

Không nên chỉ nhìn điểm F1 mà bỏ qua số mẫu. Một nhãn đạt 100% trên một video chưa cho thấy độ ổn định như cùng kết quả trên nhiều video. Số mẫu bằng 0 có nghĩa tập kiểm tra chưa cung cấp ví dụ để đánh giá khả năng tìm thấy nhãn đó.

### 8.2. Confusion matrix (ma trận nhầm lẫn)

Mỗi nhãn có bảng 2×2 riêng. Hàng biểu thị nhãn chuẩn, cột biểu thị dự đoán. Với nhãn xuống nông của squat:

| Nhãn chuẩn / Kết quả mô hình | Không báo | Có báo |
|---|---:|---:|
| Không ghi xuống nông | 158 | 16: báo thừa |
| Có ghi xuống nông | 16: bỏ sót | 25: nhận đúng |

Trong 41 video có nhãn xuống nông, mô hình tìm đúng 25 và bỏ sót 16. Trong 41 video mô hình báo xuống nông, có 25 video khớp nhãn chuẩn và 16 video báo thừa. Vì vậy, độ chuẩn xác và độ bao phủ cùng đạt 60,98%.

Các ma trận theo từng nhãn đánh giá cùng tập video, nên không cộng số video ở tất cả ma trận để tính quy mô dữ liệu. Bản normalized (chuẩn hóa) hiển thị phần trăm theo từng hàng để dễ thấy tỷ lệ bỏ sót và báo thừa.
""")
parts.append(image('per_label_confusion_matrices/confusion_matrix_03_shallow.png','Hình 1. Ma trận nhầm lẫn của nhãn xuống nông.'))
parts.append(r"""
### 8.3. Loss curve (đường sai số)

Đường sai số cho biết mô hình học phù hợp với dữ liệu đến đâu. Cần xem đồng thời huấn luyện và xác thực: nếu sai số huấn luyện tiếp tục giảm nhưng sai số xác thực tăng, mô hình có dấu hiệu học quá sát dữ liệu đã thấy.

Squat chạy 45 vòng, chọn trọng số ở vòng 29. Tại vòng được chọn, sai số huấn luyện khoảng 0,2105 và xác thực 0,3358. Đến vòng 45, sai số huấn luyện giảm còn 0,1029 nhưng xác thực tăng lên 0,3930. Mô hình vì vậy giữ vòng 29 thay vì vòng cuối.

Jumping jacks chạy đủ 70 vòng và chọn vòng 69. Sai số huấn luyện ở vòng 69 khoảng 0,0081 trong khi xác thực còn 0,2546. Chênh lệch này cho thấy mô hình học rất sát tập huấn luyện nhưng khả năng áp dụng sang dữ liệu khác chưa tương ứng.

Vạch dọc trong hình đánh dấu vòng được chọn. AP trung bình (khả năng xếp hạng nhãn) trên tập xác thực là tiêu chí chọn trọng số. F1 trong hình lịch sử dùng ngưỡng 50%, còn bảng kết quả cuối dùng ngưỡng riêng từng nhãn, nên hai số có thể khác nhau.
""")
for i,e in enumerate(reports,2):
 parts.append(image(f'loss_curve_best_stgcnpp_{e}_v4.png',f'Hình {i}. Quá trình huấn luyện {"squat" if e=="squat" else "jumping jacks"}.'))
for i,e in enumerate(reports,4):
 parts.append(image(f'precision_recall_f1_best_stgcnpp_{e}_v4.png',f'Hình {i}. Kết quả theo từng nhãn của {"squat" if e=="squat" else "jumping jacks"}.'))
parts.append(r"""
## 9. Thay đổi trong ứng dụng kiểm thử

Giao diện V4 hiển thị danh sách nhãn, điểm, ngưỡng và kết quả đối chiếu. Nhãn được báo không nhất thiết là lỗi, vì danh sách còn có thuộc tính tư thế và trạng thái. Màu xanh biểu thị nhãn được dự đoán; màu vàng biểu thị nhãn chuẩn bị bỏ sót; màu đỏ biểu thị báo thừa so với nhãn chuẩn.

Tên bài đang chọn được đặt rõ trên màn hình và có bốn nút chuyển bài bằng chuột hoặc phím số. Khi chuyển bài, kết quả cũ được xóa và video được phát lại. Điều này giúp tránh nhầm kết quả giữa các bài.

Với video thực tế, hệ thống phân tích cả đoạn để đánh giá được các trạng thái cần ngữ cảnh dài. Bảng kết quả toàn video giữ nguyên trong lúc phát để người dùng xem lại. Chế độ theo từng lượt hoặc đoạn chuyển động gần đây hỗ trợ quan sát bổ sung; các nhãn cần toàn đoạn được giới hạn theo phạm vi áp dụng.

Phần mở camera được xử lý riêng, bổ sung trạng thái chờ, thông báo lỗi và thao tác thử lại. Lần kiểm tra gần nhất xác nhận chuyển bài hoạt động nhưng webcam thật chưa mở thành công. Vì vậy, kết quả hiện có chưa thay thế cho đánh giá đầy đủ khi tập trực tiếp trước camera.

## 10. Các vấn đề và vướng mắc trong quá trình thực hiện

### 10.1. Khớp bị che khuất ở chống đẩy và gập bụng

Vướng mắc còn tồn tại là nhận diện khớp chưa ổn định ở push-up (chống đẩy) và gập bụng ngược. Với các động tác sát mặt sàn, một phần tay, chân hoặc hông có thể bị thân người hay chi bên ngoài che khuất. Khi quay ngang, khớp bên trái và bên phải dễ chồng lên nhau; ở góc chính diện hoặc chéo, một số chuyển động theo chiều sâu lại khó quan sát.

Trong các trường hợp này, mô hình có thể đặt khớp sai vị trí, nhầm bên trái–phải hoặc làm tọa độ thay đổi đột ngột giữa hai khung hình gần nhau. Trên giao diện, biểu hiện là khung xương bị giật, các đoạn tay/chân đổi hướng bất thường hoặc điểm khớp nhảy sang vị trí khác dù người tập không có chuyển động tương ứng. Vấn đề chưa được xử lý ổn định cho hai bài này.

### 10.2. Góc quay trong dữ liệu chưa phù hợp với tiêu chí cần đánh giá

Qua quan sát các video đang sử dụng, nhiều đoạn không có góc quay thuận lợi để đánh giá đầy đủ động tác. Một đoạn thường chỉ cung cấp một góc nhìn, nên khi khớp bị che hoặc hai chi chồng lên nhau, không có hình ảnh từ hướng khác để đối chiếu. Đây là vướng mắc ghi nhận trong quá trình thử nghiệm; chưa có thống kê riêng về tỷ lệ video theo mức độ phù hợp của góc quay.

Không có một góc quay luôn thuận lợi cho mọi lỗi. Góc ngang có thể giúp quan sát độ sâu và hướng thân nhưng khó phân biệt khoảng cách hai bên; góc chính diện có thể thấy rõ vị trí trái–phải nhưng khó quan sát chuyển động theo chiều sâu. Vì vậy, cùng một video có thể đủ thông tin cho nhãn này nhưng chưa đủ thông tin cho nhãn khác.

Việc tăng số vòng học không bổ sung được phần cơ thể không quan sát thấy trong video. Cần phân biệt hạn chế của hình ảnh đầu vào với hạn chế của mô hình phân loại để chọn hướng xử lý phù hợp.

### 10.3. Sai số khớp ảnh hưởng cả huấn luyện và kiểm thử

Mô hình phân loại học từ chuỗi tọa độ khớp. Nếu tọa độ nhảy bất thường, chuỗi đầu vào sẽ mô tả một chuyển động khác với động tác thực tế. Ví dụ, cổ tay hoặc hông đổi vị trí đột ngột có thể tạo ra biên độ và tốc độ giả; nhầm trái–phải có thể làm sai thông tin phối hợp giữa hai bên.

Trong huấn luyện, nếu nhãn mô tả đúng video nhưng chuỗi khớp trích xuất sai, mô hình phải học từ cặp dữ liệu không nhất quán. Điều này có thể làm khó việc học hoặc khiến mô hình ghi nhớ nhiễu. Trong kiểm thử, cùng lỗi trích xuất có thể dẫn đến bỏ sót lỗi thật, báo lỗi không có hoặc thay đổi kết quả giữa các đoạn gần nhau.

Do đó, nhận diện sai không phải lúc nào cũng do bộ phân loại chưa tốt. Chuỗi ảnh hưởng cần kiểm tra là: góc quay chưa phù hợp hoặc khớp bị khuất → tọa độ khớp sai → đặc trưng chuyển động sai → kết quả phân loại sai. Chưa có phép đo tách riêng mức đóng góp của từng khâu, nên chưa thể quy toàn bộ sai số cho một nguyên nhân.

### 10.4. Ảnh hưởng đến phân đoạn và đếm lượt

Phần theo dõi động tác dựa vào sự thay đổi vị trí và góc khớp để xác định các pha chuyển động. Khi khớp nhảy tọa độ, hệ thống có thể hiểu nhầm là người tập đã đổi hướng, hoàn thành lượt hoặc bắt đầu lượt mới. Ngược lại, mất khớp ở thời điểm quan trọng có thể khiến một lượt không được ghi nhận hoặc bị cắt thiếu.

Nếu đoạn chuyển động được cắt không đúng, dữ liệu gửi sang mô hình phân loại cũng không còn đại diện đầy đủ cho lượt tập. Vì vậy, cần kiểm tra đồng thời chất lượng khớp, cách cắt lượt và kết quả nhận diện; không chỉ quan sát nhãn cuối cùng.

### 10.5. Khó cân bằng giữa lọc nhiễu và giữ đặc điểm lỗi

Làm mượt có thể giảm dao động nhỏ nhưng chưa chắc sửa được khớp đặt sai vị trí hoặc nhầm trái–phải. Nếu làm mượt quá mạnh hoặc ép khớp về một quỹ đạo cố định, những thay đổi thực sự của động tác cũng có thể bị làm mất, đặc biệt ở các lỗi ngắn hoặc chuyển động có biên độ nhỏ.

Điểm tin cậy giúp phát hiện một phần khớp không rõ, nhưng không bảo đảm mọi khớp có điểm cao đều đúng vị trí. Đây là lý do chưa thể giải quyết vấn đề chỉ bằng cách tăng ngưỡng tin cậy hoặc thêm một bộ lọc. Cần kết hợp kiểm tra độ rõ của khớp, tính liên tục của chuyển động và sự phù hợp giữa các đoạn cơ thể.

### 10.6. Hướng xử lý dự kiến

Trước mắt, cần phân nhóm video theo góc quay và mức che khuất, đồng thời xem lại khung xương ở các đoạn có tọa độ nhảy. Những đoạn không đủ thông tin cho một tiêu chí nên được đánh dấu không đủ điều kiện đánh giá thay vì mặc định kết luận đúng hoặc sai.

Trong khâu chuẩn bị dữ liệu, cần kiểm tra chuỗi khớp trước khi đưa vào huấn luyện: xác định đoạn mất khớp kéo dài, thay đổi tọa độ bất thường và dấu hiệu nhầm trái–phải. Với khoảng mất khớp ngắn, có thể thử ước lượng từ các khung lân cận; với che khuất kéo dài, cách này chưa có đủ căn cứ để khôi phục chính xác. Các biện pháp xử lý cần được thử riêng để tránh làm mất đặc điểm lỗi.

Đối với thử nghiệm thực tế, cần hướng dẫn vị trí đặt camera theo từng bài, giữ toàn thân trong hình và ưu tiên góc nhìn phù hợp với tiêu chí đang đánh giá. Nếu bổ sung ghi hình từ nhiều góc, cần tổ chức cách thu và xử lý dữ liệu tương ứng; chưa thể xem đây là tính năng đã có của hệ thống.

Với chống đẩy và gập bụng ngược, cần ổn định bước trích xuất khớp và phân đoạn trước khi đánh giá việc mở rộng huấn luyện nhiều nhãn. Mục tiêu là giảm nhiễu ở dữ liệu đầu vào, sau đó mới xác định phần sai số còn lại thuộc về bộ phân loại. Các hướng trên là kế hoạch xử lý, chưa phải kết quả đã hoàn thành.

## 11. Nhận xét chung

| Nội dung | Kết quả đạt được | Điểm còn hạn chế |
|---|---|---|
| Nhận diện nhiều nhãn | Có thể dự đoán đồng thời lỗi, thuộc tính và trạng thái | Kết quả chưa đồng đều giữa các nhãn |
| Chi tiết đánh giá | Có số liệu và ma trận riêng từng nhãn | Nhãn hiếm hoặc chưa có mẫu kiểm tra còn thiếu căn cứ |
| Thông tin chuyển động | Bổ sung biên độ, thời gian và phối hợp tay–chân | Chưa tách riêng mức đóng góp của từng nhóm đặc trưng |
| Hiển thị kết quả | Quan sát rõ điểm, ngưỡng và nhãn đang xét | Người dùng cần phân biệt điểm mô hình với mức độ chắc chắn đúng |
| Khả năng áp dụng | Đã có mô hình và quy trình phân tích video | Cần đánh giá thêm với camera, góc quay và người tập khác nhau |

V4 cải thiện cách biểu diễn và xử lý trường hợp một video có nhiều đặc điểm cùng lúc. Kết quả tốt hơn ở các nhóm chuyển động rõ ràng; các lỗi tinh về tư thế, mức biên độ trung gian và đồng bộ còn cần cải thiện. Đây là cơ sở để tiếp tục hoàn thiện mô hình, thay vì chỉ dựa vào một chỉ số tổng hợp để đánh giá toàn bộ hệ thống.

Hướng tiếp theo là bổ sung mẫu cho nhãn hiếm, kiểm tra các nhãn có mô tả chưa thống nhất, đánh giá trên cùng bộ video khi đối chiếu phiên bản và hoàn thiện thử nghiệm camera. Với các thay đổi về đầu vào hoặc đặc trưng, cần so sánh riêng để xác định phần nào thực sự cải thiện kết quả.

## Tài liệu tham khảo

[1] Sunny Panchal và cộng sự. What to Say and When to Say it: Live Fitness Coaching as a Testbed for Situated Interaction. NeurIPS 2024. Sử dụng mục 3.2 và phụ lục C.1 về thu thập video, kiểm tra nhãn và nhãn định lượng. [Bài báo](https://arxiv.org/html/2407.08101v3).

[2] Qualcomm AI Research. Qualcomm Exercise Video Dataset. Mục Classes mô tả một hoặc nhiều nhãn trên mỗi video. [Trang dữ liệu chính thức](https://www.qualcomm.com/developer/software/qevd-dataset).

[3] scikit-learn. Tuning the decision threshold for class prediction. [Tài liệu về điều chỉnh ngưỡng](https://scikit-learn.org/stable/modules/classification_threshold.html).

Các bảng kết quả được tính từ điểm dự đoán của hai mô hình V4; ý nghĩa nhãn được đối chiếu với trường labels và labels_descriptive trong dữ liệu Qualcomm.
""")

text='\n\n'.join(parts)+'\n'
(DOC/(STEM+'.md')).write_text(text,encoding='utf-8')

def plain(value):
    value=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'\1 (\2)',value)
    return value.replace('**','').replace('`','').strip('* ')

document=Document()
section=document.sections[0]
section.page_width=Cm(21);section.page_height=Cm(29.7)
section.top_margin=Cm(2);section.bottom_margin=Cm(2)
section.left_margin=Cm(2.2);section.right_margin=Cm(1.8)
normal=document.styles['Normal'];normal.font.name='Times New Roman';normal.font.size=Pt(12)
normal.paragraph_format.line_spacing=1.15
normal.paragraph_format.space_after=Pt(6)
for name,size in [('Title',22),('Heading 1',16),('Heading 2',14),('Heading 3',12)]:
    style=document.styles[name];style.font.name='Times New Roman';style.font.size=Pt(size)
    style.font.color.rgb=RGBColor.from_string('173B56')
    style.paragraph_format.keep_with_next=True
footer=section.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
footer.add_run('Smart Gym V4 | 24/10/2026 | Trang ')
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)

lines=text.splitlines();i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            row=[plain(v) for v in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?',v.strip()) for v in row):rows.append(row)
            i+=1
        t=document.add_table(rows=1,cols=len(rows[0]));t.style='Light Shading Accent 1'
        for cell,value in zip(t.rows[0].cells,rows[0]):cell.text=value
        repeat=OxmlElement('w:tblHeader');t.rows[0]._tr.get_or_add_trPr().append(repeat)
        for row in rows[1:]:
            cells=t.add_row().cells
            for cell,value in zip(cells,row):cell.text=value
        for row in t.rows:
            no_split=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(no_split)
            for cell in row.cells:
                for p in cell.paragraphs:
                    p.paragraph_format.space_after=Pt(3)
                    for run in p.runs:run.font.size=Pt(10)
        document.add_paragraph()
        continue
    if line.startswith('!['):
        match=re.fullmatch(r'!\[(.*?)\]\((.*?)\)',line)
        if match:
            path=(DOC/match.group(2)).resolve();assert path.is_file()
            p=document.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            p.add_run().add_picture(str(path),width=Cm(16.6))
    elif line.startswith('# '):document.add_heading(plain(line[2:]),0)
    elif line.startswith('### '):document.add_heading(plain(line[4:]),2)
    elif line.startswith('## '):document.add_heading(plain(line[3:]),1)
    else:
        p=document.add_paragraph(plain(line))
        if line.startswith('*') and not line.startswith('**'):
            for run in p.runs:run.italic=True;run.font.size=Pt(10)
        else:p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
    i+=1
path=DOC/(STEM+'.docx');document.save(path)
check=Document(path)
assert len(check.tables)==9 and len(check.inline_shapes)==5
for match in re.finditer(r'!\[[^\]]*\]\(([^)]+)\)',text):
    assert (DOC/match.group(1)).resolve().is_file()
print(json.dumps({'markdown':str(DOC/(STEM+'.md')),'word':str(path),'characters':len(text),'tables':len(check.tables),'embedded_figures':len(check.inline_shapes)},ensure_ascii=False,indent=2))
