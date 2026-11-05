"""Rewrite the existing model report in plain Vietnamese, preserving evidence."""
from pathlib import Path
import importlib.util
import json
import re

ROOT=Path(__file__).resolve().parents[3]
DOC=ROOT/'doc'
STEM='Bao_cao_V4_Chong_day_Gap_bung_va_Thuc_nghiem_Web'
PATH=DOC/(STEM+'.md')
spec=importlib.util.spec_from_file_location('floor_report',Path(__file__).with_name('create_floor_v4_web_report.py'))
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
table=helpers.table
picture=helpers.picture
OUT=ROOT/'stgcn_model_training/outputs/v4'
ASSETS=DOC/'assets_v4_chong_day_gap_bung'
reports={s:json.loads((OUT/f'test_report_{s}_v4_multihead.json').read_text(encoding='utf-8')) for s in ('pushup','crunch')}
names={'pushup':'Chống đẩy','crunch':'Gập bụng ngược'}
number=helpers.number
pct=helpers.pct


def main():
    parts=[r'''# BÁO CÁO KẾT QUẢ XÂY DỰNG MÔ HÌNH V4

## BỔ SUNG CHỐNG ĐẨY, GẬP BỤNG NGƯỢC VÀ TRIỂN KHAI TRÊN WEB

Ngày báo cáo: 30/10/2026

## 1. Mục tiêu thực hiện

Trong tuần trước, V4 được triển khai với hai bài squat (ngồi xổm) và jumping jacks (bật nhảy dang tay chân). Qua các bài thử thực tế đã thực hiện, hai mô hình cho kết quả khả quan và hoạt động ổn định trong điều kiện đã kiểm tra. Kết quả này là cơ sở để tiếp tục áp dụng phương pháp nhận diện nhiều nhãn cho hai bài chống đẩy và gập bụng ngược trong tuần này.

Trong thực tế, người tập có thể mắc nhiều lỗi cùng lúc. Chẳng hạn, khi chống đẩy, người tập vừa xuống chưa đủ sâu vừa nâng hông quá cao. Vì vậy, kết quả nhận diện cần thể hiện được cả hai vấn đề để cung cấp thông tin đầy đủ hơn về đoạn tập.

Hai mô hình mới có 21 nhãn cho chống đẩy và 19 nhãn cho gập bụng ngược. Báo cáo tập trung vào phần bổ sung so với V4 tuần trước, dữ liệu và kết quả của hai bài mới, cùng nhận xét tổng quan về khả năng sử dụng trên web.

## 2. Những thay đổi so với V4 tuần trước

### 2.1. Mở rộng từ hai bài sang bốn bài nhận diện nhiều nhãn

V4 tuần trước tập trung vào hai bài: squat với 14 nhãn và jumping jacks với 29 nhãn. Việc kiểm tra bằng video thực tế cho thấy phương pháp đã đáp ứng được bước thử nghiệm ban đầu, với khả năng nhận diện nhiều đặc điểm cùng lúc và kết quả hoạt động ổn định trong phạm vi đã thử.

Trên cơ sở đó, tuần này tiếp tục sử dụng phương pháp đã triển khai để xây dựng mô hình cho chống đẩy và gập bụng ngược. Phần bổ sung gồm dữ liệu và nhãn của từng bài, thông tin chuyển động phù hợp với tư thế gần sàn, cùng việc đưa hai mô hình mới vào chương trình kiểm tra và giao diện web. Phạm vi hỗ trợ của V4 được mở rộng từ hai lên bốn bài.
''',table(['Nội dung','V4 tuần trước','Bản cập nhật hiện tại'],[
        ['Phạm vi nhiều nhãn','Squat và jumping jacks','Đủ bốn bài: squat, jumping jacks, chống đẩy và gập bụng ngược'],
        ['Chống đẩy','Chưa nằm trong phạm vi hai bài đã triển khai','Bổ sung mô hình 21 nhãn về lỗi và đặc điểm tư thế'],
        ['Gập bụng ngược','Chưa nằm trong phạm vi hai bài đã triển khai','Bổ sung mô hình 19 nhãn về mức thực hiện, tư thế và trạng thái'],
        ['Thông tin riêng cho hai bài mới','Chưa có hai mô hình nhiều nhãn tương ứng','Bổ sung thông tin về góc khuỷu, vị trí hông, mức co chân và chuyển động gần sàn'],
        ['Xử lý quan sát yếu ở hai bài mới','Chưa có phần cập nhật này','Bổ sung trạng thái chờ khi thiếu khớp và hạn chế đếm nhầm khi đổi bên theo dõi'],
        ['Cách sử dụng','Chủ yếu kiểm tra qua chương trình Python','Bổ sung giao diện web cho cả bốn bài, hỗ trợ theo dõi trực tiếp và phân tích video']]),r'''
### 2.2. Bổ sung thông tin phù hợp với chống đẩy và gập bụng ngược

Chống đẩy cần quan sát rõ khuỷu tay, vị trí hông và sự thẳng hàng của thân. Gập bụng ngược cần theo dõi mức co chân và chuyển động hông. Vì vậy, hai mô hình được bổ sung thông tin tóm tắt riêng cho từng bài thay vì chỉ dựa vào cùng một nhóm đặc điểm chung.

Mỗi video của hai bài mới được lấy 128 khung hình và kết hợp 32 thông tin tóm tắt chuyển động. Cách tổ chức này giúp mô hình có thêm căn cứ khi học, nhưng mức đóng góp của từng thông tin chưa được thử nghiệm tách riêng. Vì vậy, chưa khẳng định chỉ riêng việc bổ sung các thông tin này đã làm độ chính xác tăng bao nhiêu.

### 2.3. Bổ sung xử lý khớp yếu và sử dụng trên web

Với hai bài gần sàn, bản cập nhật bổ sung trạng thái chờ khi thiếu khớp quan trọng. Bộ đếm ưu tiên bên cơ thể có khớp rõ hơn; việc đổi bên theo dõi không tự được tính thành một lượt hoàn thành. Các thay đổi này nhằm hạn chế kết luận từ quan sát thiếu, chưa giải quyết hoàn toàn tình trạng khớp bị đoán sai.

Bên cạnh chương trình Python, bản cập nhật có giao diện web cho cả bốn bài. Người dùng có thể chọn bài, mở nguồn hình, xem bảng nhãn và phân tích cả video. Phần web được xem xét về khả năng sử dụng và phản hồi tổng quát; số liệu đo chi tiết chưa được dùng làm kết quả kiểm chứng chính thức trong báo cáo.

## 3. Dữ liệu Qualcomm và cách sử dụng nhãn

### 3.1. Nguồn dữ liệu

Hai mô hình sử dụng dữ liệu và nhãn chi tiết của Qualcomm. Theo [bài báo của nhóm tác giả](https://arxiv.org/html/2407.08101v3), các biến thể bài tập được xây dựng với sự tham vấn của huấn luyện viên. Người tham gia được cung cấp hướng dẫn và video mẫu; video cùng nhãn sau đó được kiểm tra thủ công.

[Trang dữ liệu chính thức](https://www.qualcomm.com/developer/software/qevd-dataset) cho biết một video có thể mang một hoặc nhiều nhãn. Đây là cơ sở để tổ chức bài toán nhận diện nhiều nhãn trong V4.

### 3.2. Ý nghĩa của nhãn

Nhãn trong dữ liệu không chỉ mô tả lỗi. Một số nhãn thể hiện tư thế, mức chuyển động hoặc trạng thái của người tập. Ví dụ, “hông bị võng xuống” là một vấn đề cần kiểm tra, còn “đầu nâng lên” chỉ mô tả điều quan sát được trong video.
''',table(['Bài tập','Ví dụ nhãn','Ý nghĩa sử dụng'],[
        ['Chống đẩy','Khuỷu gập 90°','Mô tả độ sâu động tác'],
        ['Chống đẩy','Xuống nông; hông nâng quá cao','Các lỗi có thể cùng xuất hiện'],
        ['Chống đẩy','Tư thế chờ chống tay; dừng sớm','Trạng thái cần theo dõi cả đoạn video'],
        ['Gập bụng ngược','Co chân chưa đến 90°; chưa nâng hông','Các vấn đề về mức thực hiện động tác'],
        ['Gập bụng ngược','Đầu nâng lên; bàn chân hướng về camera','Đặc điểm tư thế hoặc vị trí quay'],
        ['Gập bụng ngược','Mức nâng 1–5','Các mức theo dữ liệu nguồn, không tự đổi thành centimét hoặc độ góc']]),r'''
Khi huấn luyện, mô hình học những nhãn có trong danh sách chú thích của từng video. Video chỉ có một nhãn vẫn được sử dụng bình thường. Những nhãn không được ghi trong danh sách không được diễn giải thêm thành kết luận rằng người tập chắc chắn đã thực hiện đúng các tiêu chí đó.

## 4. Dữ liệu sử dụng và cách chia tập

Tổng cộng 7.625 video được đưa vào quy trình của hai bài. Dữ liệu được chia thành ba tập với vai trò khác nhau:
''',table(['Tập dữ liệu','Chống đẩy','Gập bụng ngược','Tổng'],[
        ['Huấn luyện','3.391','2.700','6.091'],['Xác thực','598','476','1.074'],
        ['Kiểm tra','261','199','460'],['Tổng','4.250','3.375','7.625']]),r'''
Tập huấn luyện giúp mô hình học các đặc điểm của động tác. Tập xác thực được dùng trong quá trình lựa chọn mô hình và ngưỡng nhận diện. Tập kiểm tra dùng để đánh giá sau khi hoàn tất các lựa chọn này.

Các tập đã được kiểm tra để tránh trùng video và trùng nội dung. Tuy nhiên, hiện chưa xác nhận được việc tách hoàn toàn theo từng người tập. Do đó, kết quả chưa đủ để kết luận khả năng nhận diện trên những người hoàn toàn mới.

## 5. Phương pháp xây dựng và huấn luyện mô hình

### 5.1. Thông tin dùng để nhận diện

Hệ thống xác định 17 điểm khớp trên cơ thể rồi theo dõi sự thay đổi của các điểm này trong video. Mỗi video được lấy 128 khung hình trải trên cả đoạn để quan sát các pha chuyển động và thời gian chờ.

Mô hình ST-GCN++ (mạng học mối liên hệ giữa các khớp theo thời gian) sử dụng chuỗi khớp để nhận diện động tác. Bên cạnh đó, mỗi bài có thêm 32 thông tin tóm tắt chuyển động. Với chống đẩy, các thông tin này liên quan đến góc khuỷu, vị trí hông và khoảng cách tay. Với gập bụng ngược, thông tin tập trung vào góc hông, góc gối và mức di chuyển của chân, hông.

Các thông tin bổ sung giúp mô hình có thêm căn cứ khi học. Kết quả cuối cùng vẫn do mô hình dự đoán từ dữ liệu đã được gán nhãn.

### 5.2. Cách tổ chức quá trình học

Mỗi nhãn được học riêng theo việc có xuất hiện trong chú thích của video hay không. Vì số video giữa các nhãn không đều nhau, quá trình huấn luyện sử dụng trọng số để tăng mức đóng góp của các nhãn ít gặp. Cách làm này hỗ trợ giảm mất cân bằng, nhưng không thay thế được việc bổ sung video cho những nhãn quá ít mẫu.
''',table(['Thiết lập','Cách thực hiện'],[
        ['Số vòng học tối đa','70 vòng'],['Số video trong một lô học','32 video'],
        ['Cập nhật trọng số','AdamW (thuật toán điều chỉnh trọng số mô hình), tốc độ học ban đầu 0,001 và giảm dần'],
        ['Tăng sự đa dạng của dữ liệu','Đối xứng trái–phải và thêm dao động tọa độ nhỏ'],
        ['Chọn mô hình','Dựa trên kết quả của tập xác thực'],
        ['Dừng sớm','Dừng nếu chỉ số chọn mô hình không cải thiện trong 16 vòng liên tiếp']]),r'''
Chống đẩy kết thúc sau 53 vòng và sử dụng trọng số ở vòng 37. Gập bụng ngược kết thúc sau 58 vòng và sử dụng trọng số ở vòng 42. Ở các vòng sau, mô hình vẫn học sát hơn dữ liệu huấn luyện nhưng kết quả xác thực không tốt lên tương ứng. Vì vậy, sử dụng vòng cuối chưa chắc cho kết quả tốt hơn trên video khác.

### 5.3. Cách xác định một nhãn xuất hiện

Mô hình trả về điểm riêng cho từng nhãn. Điểm này được so với một ngưỡng để quyết định có báo nhãn hay không. Ngưỡng được lựa chọn trên tập xác thực nhằm cân bằng giữa báo thừa và bỏ sót, sau đó giữ cố định khi kiểm tra. Cơ sở của việc điều chỉnh ngưỡng được trình bày trong [tài liệu scikit-learn](https://scikit-learn.org/stable/modules/classification_threshold.html).

Ví dụ, ở chống đẩy, ngưỡng xuống nông là 50% và hông nâng quá cao là 77,5%. Nếu cả hai điểm đều vượt ngưỡng tương ứng, hệ thống báo cả hai nhãn. Các điểm này độc lập, không cần cộng thành 100%. Điểm hiển thị cũng chưa được xác minh để hiểu là xác suất kết luận đúng.

## 6. Kết quả đánh giá tổng hợp

### 6.1. Kết quả trên tập kiểm tra
''',table(['Bài tập','Số video','F1 gộp','F1 trung bình nhãn','Khớp toàn bộ nhãn'],[
        [names[s],reports[s]['test']['samples'],pct(reports[s]['test']['micro_f1']),pct(reports[s]['test']['macro_f1']),pct(reports[s]['test']['exact_match'])] for s in reports]),r'''
F1 là chỉ số cân bằng giữa việc báo đúng và tìm đủ nhãn. F1 gộp tổng hợp các quyết định của mô hình; nhãn phổ biến có ảnh hưởng nhiều hơn đến kết quả này. F1 trung bình nhãn cho mỗi nhãn vai trò như nhau, giúp quan sát mô hình có nhận diện đồng đều hay không.

Khớp toàn bộ nhãn yêu cầu mô hình nhận đúng đủ danh sách chú thích của một video. Chỉ cần thiếu hoặc thừa một nhãn, video đó chưa được tính là khớp. Chống đẩy có 109/261 video khớp toàn bộ; gập bụng ngược có 70/199 video. Đây là mức khớp chú thích, không phải tỷ lệ người tập thực hiện đúng kỹ thuật.

Kết quả cho thấy hai mô hình đã có khả năng nhận diện nhiều nhãn, nhưng còn bỏ sót và báo thừa. Chống đẩy đạt F1 gộp 60,80%; gập bụng ngược đạt 64,16%. Mức khớp toàn bộ còn thấp cho thấy việc nhận đúng đầy đủ mọi đặc điểm trong một video vẫn là khó khăn.

F1 trung bình trong bảng tính trên toàn bộ 21 và 19 nhãn. Nhãn không có video mang nhãn đó trong tập kiểm tra được ghi F1 bằng 0. Nếu chỉ tính các nhãn có mẫu kiểm tra, kết quả tương ứng là 59,09% và 65,21%. Vì vậy, cần xem cả số mẫu khi nhận xét từng nhãn.

### 6.2. Ý nghĩa kết quả so với V4 tuần trước và video thực tế

Kết quả thử nghiệm khả quan của squat và jumping jacks ở tuần trước là cơ sở để tiếp tục mở rộng cùng phương pháp sang hai bài mới. Việc đánh giá lần này nhằm xác định phương pháp đáp ứng đến đâu khi áp dụng cho chống đẩy và gập bụng ngược. Mỗi bài có chuyển động, danh sách nhãn và dữ liệu riêng, nên cần nhận xét kết quả của từng bài thay vì dùng F1 giữa các bài để kết luận mức tăng độ chính xác chung.

Khi thử thêm video thực tế, F1 gộp của chống đẩy đạt 66,04%, còn gập bụng ngược đạt 47,73%. Tỷ lệ khớp toàn bộ tương ứng là 20% và 10%. Đặc biệt, kết quả gập bụng ngược giảm so với tập kiểm tra nội bộ cho thấy mô hình chưa ổn định khi điều kiện ghi hình thay đổi. Nhóm video thử thêm chưa bao phủ đầy đủ các nhãn nên cần tiếp tục đánh giá.

## 7. Kết quả từng nhãn và nhận xét
''']
    for i,s in enumerate(reports,1):
        parts += [f'### 7.{i}. {names[s]}',table(['Nhãn','Precision (độ chuẩn xác)','Recall (độ bao phủ)','F1','Số video có nhãn'],[
            [r['name_vi'],pct(r['precision']),pct(r['recall']),pct(r['f1']),r['support']] for r in reports[s]['test']['per_label'].values()])]
        if s=='pushup':
            parts += ['Chống đẩy nhận diện tốt hơn những chuyển động khác biệt rõ, như chuyển người sang hai bên hoặc chuyển sang tư thế em bé. Nhãn đặt tay quá hẹp đạt F1 97,14% trên 17 video. Ngược lại, hông bị võng xuống chỉ đạt 16,22%; đầu chuyển động đạt 22,22%; đầu cúi xuống đạt 0%. Đây là các nhãn cần ưu tiên xem lại dữ liệu và chuỗi khớp.',
                      'Một số nhãn đạt 100% nhưng số video đánh giá còn ít, chẳng hạn đầu ra vào khung hình chỉ có bốn video. Kết quả này chỉ phản ánh các mẫu đã kiểm tra, chưa chứng minh độ ổn định trên nhiều người và nhiều góc quay.']
        else:
            parts += ['Gập bụng ngược có kết quả tốt hơn ở duỗi chân (89,66%), chưa nâng hông khỏi sàn (78,57%) và đầu nâng lên (86,15%). Các mức nâng 1–5 còn khó phân biệt, với F1 khoảng 31,37–63,64%. Nhãn đùi không chuyển động chỉ có một video kiểm tra nên chưa đủ dữ liệu để nhận xét ổn định.']
    parts += [r'''### 7.3. Cách đọc các hàng có ít hoặc không có mẫu

Precision (độ chuẩn xác) cho biết trong những video mô hình báo một nhãn, bao nhiêu video khớp chú thích nguồn. Recall (độ bao phủ) cho biết trong những video thực sự có nhãn nguồn đó, mô hình tìm được bao nhiêu. F1 tổng hợp hai mặt này.

Cột số video có nhãn cho biết lượng dữ liệu làm căn cứ đánh giá. Nhãn dáng tập thiếu ổn định của chống đẩy và không nhìn thấy rõ của gập bụng ngược đều chưa có mẫu mang nhãn đó trong tập kiểm tra. Vì vậy, F1 bằng 0 ở hai hàng này chưa đủ để kết luận mô hình không nhận diện được nhãn.

## 8. Phân tích biểu đồ và quá trình học

### 8.1. Ma trận nhầm lẫn

Ma trận nhầm lẫn thể hiện các trường hợp nhận đúng, báo thừa và bỏ sót của từng nhãn. Ví dụ, với nhãn hông bị võng xuống của chống đẩy:
''',table(['Chú thích nguồn / Kết quả mô hình','Không báo','Có báo'],[
        ['Không ghi nhãn hông võng','227','15: báo thừa'],['Có ghi nhãn hông võng','16: bỏ sót','3: nhận đúng']]),r'''
Trong 19 video có nhãn hông võng, mô hình nhận đúng ba video và bỏ sót 16 video. Đồng thời, có 15 video bị báo nhãn nhưng nguồn không ghi nhận nhãn đó. Kết quả cho thấy mô hình vừa tìm chưa đủ lỗi, vừa còn báo thừa ở tiêu chí này.
''',picture(OUT/'per_label_confusion_matrices_pushup/confusion_matrix_10_butt_sinking.png','Hình 1. Ma trận nhầm lẫn của nhãn hông bị võng xuống.'),r'''
### 8.2. Đường sai số trong quá trình huấn luyện

Đường sai số cho biết mô hình thay đổi như thế nào qua từng vòng học. Ở cả hai bài, sai số trên tập huấn luyện giảm dần. Tuy nhiên, về cuối quá trình học, sai số trên tập xác thực lại tăng. Điều này cho thấy mô hình học ngày càng sát các video đã gặp nhưng chưa cải thiện tương ứng khi nhận video khác.

Hiện tượng này được gọi là overfitting (học quá sát dữ liệu huấn luyện). Việc dừng sớm và chọn trọng số theo tập xác thực giúp hạn chế sử dụng các vòng học không còn mang lại kết quả tốt hơn.
''',picture(OUT/'loss_curve_best_stgcnpp_pushup_v4.png','Hình 2. Quá trình học của chống đẩy; trọng số được chọn ở vòng 37.'),
        picture(OUT/'loss_curve_best_stgcnpp_crunch_v4.png','Hình 3. Quá trình học của gập bụng ngược; trọng số được chọn ở vòng 42.'),r'''
Vạch đánh dấu trong hình là vòng được chọn để sử dụng. Các đường F1 trong quá trình học dùng chung ngưỡng 0,5 để theo dõi. Bảng kết quả cuối được tính bằng ngưỡng riêng của từng nhãn nên không nhất thiết trùng với đường F1 trên hình.

### 8.3. Biểu đồ kết quả từng nhãn

Hai biểu đồ dưới đây giúp quan sát sự chênh lệch giữa các nhãn. Những nhãn có kết quả thấp cần được xem lại cùng số mẫu và các video báo sai, thay vì chỉ dựa vào một chỉ số chung cho cả bài.
''',picture(OUT/'precision_recall_f1_best_stgcnpp_pushup_v4.png','Hình 4. Kết quả nhận diện các nhãn của chống đẩy.'),
        picture(OUT/'precision_recall_f1_best_stgcnpp_crunch_v4.png','Hình 5. Kết quả nhận diện các nhãn của gập bụng ngược.'),r'''
## 9. Cập nhật chương trình kiểm tra và giao diện web

Hai mô hình đã được đưa vào chương trình kiểm tra Python và giao diện web. Mỗi bài có bảng thể hiện đầy đủ các nhãn, điểm dự đoán, ngưỡng và kết quả. Hệ thống phân biệt nhãn lỗi với các đặc điểm hoặc trạng thái khác để người xem hiểu đúng nội dung nhận diện.

Người dùng có thể chọn bài, mở video hoặc nguồn hình camera, theo dõi chuyển động và phân tích toàn đoạn. Những nhãn cần quan sát cả video, như dừng sớm hoặc trạng thái chờ, chỉ được áp dụng ở chế độ toàn đoạn.

Khi thiếu khớp cần thiết, ứng dụng thông báo chưa đủ dữ liệu để đánh giá. Bộ đếm sử dụng bên cơ thể có khớp rõ hơn; việc đổi bên theo dõi không tự được tính là hoàn thành một lượt. Khi áp dụng điều kiện quan sát khớp của ứng dụng, F1 gộp trên tập kiểm tra là 60,24% cho chống đẩy và 63,71% cho gập bụng ngược. Các video thiếu khớp vẫn được tính trong đánh giá.

Toàn bộ 58 kiểm thử chương trình đều đạt. Kết quả quyết định nhãn trên tập kiểm tra cũng thống nhất khi chạy bằng bộ xử lý trung tâm và bộ xử lý đồ họa. Những kiểm tra này xác nhận chương trình hoạt động nhất quán; chất lượng nhận diện vẫn cần được đánh giá qua các chỉ số và video thực tế.

## 10. Khả năng phản hồi khi sử dụng trên web

### 10.1. Cách tổ chức sử dụng

Giao diện web hiển thị hình ảnh và bảng kết quả, còn máy chủ thực hiện tìm khớp, đếm lượt và nhận diện nhãn. Trong bản chạy nội bộ, trình duyệt và máy chủ hoạt động trên cùng máy. Nguồn hình thử gồm tệp video và camera mô phỏng bằng video.

Hình ảnh được phát tại trình duyệt trong khi hệ thống chọn các khung cần phân tích rồi gửi kết quả trở lại. Vì vậy, tốc độ hình ảnh và tốc độ xử lý nhận diện không nhất thiết bằng nhau.

### 10.2. Nhận xét tổng quan về phản hồi

Quan sát sơ bộ trên bản chạy thử cho thấy hình ảnh có thể tiếp tục phát trong khi hệ thống xử lý và cập nhật kết quả. Mức tham khảo tổng quan được thể hiện như sau:
''',table(['Nội dung','Mức tham khảo từ bản chạy thử'],[
        ['Hình ảnh hiển thị','Khoảng 30 FPS (khung hình mỗi giây)'],
        ['Xử lý nhận diện khung hình','Thường khoảng 10–15 kết quả mỗi giây'],
        ['Chờ kết quả nhận diện ban đầu','Cần một đoạn chuyển động ngắn để thu đủ khớp, thay vì có nhãn ngay khi mở nguồn hình']]),r'''
Các mức trên chỉ mô tả tổng quan bản chạy thử nội bộ, chưa được sử dụng làm số liệu kiểm chứng chính thức. Tốc độ thực tế còn phụ thuộc vào cấu hình máy, nguồn hình và điều kiện ghi hình. Báo cáo không đưa các mốc độ trễ chi tiết thành kết luận về trải nghiệm sử dụng.

Về cách phản hồi, hệ thống cần quan sát sự thay đổi của khớp qua nhiều khung hình rồi mới nhận diện đoạn chuyển động. Sau khi có đủ thông tin, bảng nhãn được cập nhật theo từng đoạn gần đây. Người dùng cũng có thể chọn phân tích toàn video để xem kết quả cho cả đoạn.

### 10.3. Phạm vi đánh giá và bước tiếp theo

Phần web hiện đã thể hiện được luồng sử dụng từ chọn bài, mở nguồn hình đến xem kết quả. Tuy nhiên, bản chạy thử chưa thay thế cho việc kiểm tra trực tiếp bằng webcam thật và đánh giá trong nhiều điều kiện sử dụng.

Trước khi kết luận chính thức về độ trễ, cần thực hiện và kiểm chứng lại trên camera thật, ghi nhận thời gian chờ, độ ổn định và khả năng cập nhật nhãn trong khi tập. Việc thử trên các thiết bị khác và điều kiện mạng khác cũng cần được bổ sung. Phản hồi hình ảnh nhanh chưa đủ để khẳng định hệ thống đã nhận đúng lỗi hoặc cảnh báo đúng thời điểm.

## 11. Khó khăn và hướng xử lý

### 11.1. Khớp bị che khuất và sai vị trí

Chống đẩy và gập bụng ngược đều có cơ thể gần sàn, khiến tay, chân và thân dễ che nhau. Khi góc quay không phù hợp, khớp có thể bị mất, nhầm bên hoặc thay đổi tọa độ đột ngột. Chuỗi khớp sai sẽ làm thông tin về biên độ và tốc độ sai theo, từ đó ảnh hưởng đến đếm lượt và phân loại.

Trong nhiều video, mỗi người chỉ được quay từ một góc. Hệ thống không có góc nhìn khác của cùng chuyển động để đối chiếu. Điểm tin cậy của bộ tìm khớp hỗ trợ phát hiện một phần trường hợp yếu, nhưng chưa bảo đảm những khớp có điểm cao đều đúng vị trí.

### 11.2. Chênh lệch số mẫu và nhãn còn khó nhận diện

Số video giữa các nhãn không đồng đều. Một số nhãn chỉ có rất ít mẫu, làm hạn chế khả năng học và đánh giá. Bên cạnh đó, các khác biệt nhỏ như mức nâng chân hoặc vị trí hông dễ bị ảnh hưởng bởi góc quay. Đây là những nguyên nhân có thể góp phần làm kết quả chưa đồng đều, nhưng cần phân tích từng trường hợp trước khi kết luận mức ảnh hưởng của mỗi nguyên nhân.

### 11.3. Hướng thực hiện tiếp theo

Trong thời gian tiếp theo, cần xem lại những video báo thừa và bỏ sót để phân biệt lỗi do tìm khớp, do thiếu dữ liệu hay do mô hình phân loại. Việc đánh giá nên được tổ chức theo góc quay, ánh sáng và mức che khuất để xác định rõ điều kiện sử dụng.

Đối với ứng dụng web, cần tiếp tục đo bằng webcam thật, kiểm tra trong thời gian dài hơn và thử trên các cấu hình thiết bị khác nhau. Đồng thời, cần gán mốc thời gian cho một số lỗi để đánh giá khả năng cảnh báo đúng lúc. Việc fine-tuning (huấn luyện tinh chỉnh) chỉ nên thực hiện sau khi xác định được vấn đề và có dữ liệu phù hợp.

## 12. Kết luận

Từ kết quả thử nghiệm thực tế khả quan và hoạt động ổn định của hai bài squat, jumping jacks trong tuần trước, phương pháp nhận diện nhiều nhãn được tiếp tục áp dụng cho chống đẩy và gập bụng ngược. Hai bài mới bổ sung lần lượt 21 và 19 nhãn, đưa phạm vi hỗ trợ của V4 từ hai lên bốn bài. Kết quả hiện tại cho thấy phương pháp có thể tiếp tục mở rộng, đồng thời cũng chỉ ra những nhãn và điều kiện ghi hình còn cần cải thiện ở hai bài gần sàn.

Qua bản chạy thử nội bộ, web đã thể hiện được luồng chọn bài, phát hình và trả kết quả nhận diện. Phần phản hồi hiện được trình bày ở mức tổng quan; cần kiểm chứng trực tiếp trước khi đưa ra kết luận chính thức về độ trễ và độ ổn định khi sử dụng thực tế.

Hệ thống đã có thể phục vụ kiểm tra và trình diễn trong điều kiện được kiểm soát. Để sử dụng rộng hơn, cần tiếp tục cải thiện các nhãn còn yếu, kiểm tra độ chính xác khớp và đánh giá bằng camera thật trong nhiều điều kiện tập luyện.

## Tài liệu tham khảo

1. Sunny Panchal và cộng sự. What to Say and When to Say it: Live Fitness Coaching as a Testbed for Situated Interaction. NeurIPS 2024. [Bài báo](https://arxiv.org/html/2407.08101v3).
2. Qualcomm AI Research. Qualcomm Exercise Video Dataset. [Trang dữ liệu chính thức](https://www.qualcomm.com/developer/software/qevd-dataset).
3. scikit-learn. Tuning the decision threshold for class prediction (điều chỉnh ngưỡng quyết định). [Tài liệu chính thức](https://scikit-learn.org/stable/modules/classification_threshold.html).

Số liệu mô hình được tổng hợp từ kết quả đánh giá đã lưu. Phần web chỉ trình bày mức tham khảo tổng quan từ bản chạy thử; cần kiểm chứng trực tiếp trước khi đưa vào đánh giá định lượng chính thức.
''']
    text='\n\n'.join(parts)+'\n'
    PATH.write_text(text,encoding='utf-8')
    helpers.export_docx(PATH,minimum_tables=9,expected_figures=5)
    print('Updated report:',PATH)


if __name__=='__main__':main()
