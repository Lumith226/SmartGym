"""Revise the existing report's presentation without changing experiment results."""
from pathlib import Path

script=Path(__file__).with_name('create_v4_report.py')
old=script.read_text(encoding='utf-8')
prefix=old[:old.index('parts = [r')]
suffix=old[old.index("text='\\n\\n'.join(parts)+'\\n'"):]
body=r'''
parts=[r"""# BÁO CÁO TỔNG HỢP KẾT QUẢ VÀ CÁC CẢI TIẾN SMART GYM V4

Ngày báo cáo: 24/10/2026

## 1. Mục tiêu của phiên bản V4

V4 tập trung vào nhận diện đồng thời nhiều lỗi và đặc điểm chuyển động trong bài squat và jumping jacks (bật nhảy dang tay chân). Thay vì chọn một lớp chính cho mỗi video, mô hình đánh giá riêng từng nhãn. Cách tổ chức này phù hợp với trường hợp người tập vừa xuống nông, vừa có vấn đề về lưng hoặc khoảng cách chân.

Hai thay đổi chính là giữ chi tiết các nhãn Qualcomm và bổ sung thông tin về biên độ, thời gian, nhịp chuyển động vào quá trình học. Squat có 14 nhãn; jumping jacks có 29 nhãn. Kết quả được trình bày theo từng nhãn để xác định tiêu chí nào nhận diện tốt và tiêu chí nào cần cải thiện.

## 2. Thay đổi qua các phiên bản V2, V3 và V4

| Nội dung | V2 | V3 | V4 |
|---|---|---|---|
| Hướng xử lý chính | Phân loại bốn lớp với các bước hiệu chỉnh khớp | Giảm can thiệp nắn khớp, thay bộ tìm khớp bằng RTMPose và điều chỉnh phân đoạn chuyển động | Chuyển sang nhận diện nhiều nhãn cho squat và jumping jacks |
| Cách biểu diễn kết quả | Một lớp chính: đúng hoặc một nhóm lỗi | Một lớp chính, có thể bổ sung cảnh báo lỗi phụ | Điểm và quyết định riêng cho 14/29 nhãn |
| Chuỗi đầu vào | 32 khung mẫu | 32 khung mẫu, tập trung đoạn chuyển động | 64 khung mẫu squat; 128 khung mẫu jumping jacks, giữ ngữ cảnh cả đoạn |
| Thông tin dùng để học | Chuỗi khớp đã xử lý | Chuỗi khớp giảm nắn chỉnh cứng | Chuỗi khớp kết hợp 16/32 đặc trưng bổ sung |
| Cách học nhãn | Mỗi mẫu có một lớp mục tiêu | Mỗi mẫu có một lớp mục tiêu | Một mẫu có thể đồng thời mang nhiều nhãn mục tiêu |
| Cách quyết định | Ưu tiên lớp điểm cao nhất | Ưu tiên lớp điểm cao nhất, kèm xử lý hiển thị | So sánh từng điểm với ngưỡng riêng |
| Đánh giá chính | Tỷ lệ phân loại đúng một lớp | Tỷ lệ phân loại đúng một lớp và kết quả từng lớp | F1 theo nhãn, khớp toàn bộ nhãn và ma trận 2×2 từng nhãn |

V3 có thể hiển thị thêm lỗi phụ, nhưng mô hình vẫn được huấn luyện theo một lớp chính. V4 thay đổi ngay từ mục tiêu huấn luyện: một video có nhiều nhãn thì nhiều đầu ra cùng được học là có. Nhờ đó, các lỗi không phải cạnh tranh để chỉ giữ lại một lỗi duy nhất.

## 3. Dữ liệu Qualcomm và ý nghĩa của nhãn

### 3.1. Cách xây dựng dữ liệu

Theo mục 3.2 và phụ lục C.1 của bài báo, các biến thể được xây dựng với huấn luyện viên. Người tham gia thực hiện theo hướng dẫn và video mẫu; video cùng nhãn được người kiểm tra lại. [1]

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

## 10. Nhận xét chung

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
'''
# Keep primary-source URLs visible in the Word bibliography as well.
suffix=suffix.replace("r'\\1',value)","r'\\1 (\\2)',value)") if False else suffix
suffix=suffix.replace("r'\\[([^\\]]+)\\]\\([^)]+\\)',r'\\1',value)","r'\\[([^\\]]+)\\]\\(([^)]+)\\)',r'\\1 (\\2)',value)")
script.write_text(prefix+body+'\n'+suffix,encoding='utf-8')
print('Revised report generator: formal presentation, verified source-based labels, no separate test-set details.')
