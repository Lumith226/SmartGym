"""Generate the two-model report and web latency figures from saved measurements."""
from pathlib import Path
import csv
import hashlib
import json
import re
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.metrics import multilabel_confusion_matrix
from docx import Document
from docx.shared import Cm, Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'stgcn_model_training/outputs/v4'
DOC=ROOT/'doc'
TIMING=ROOT/'smart_gym_web_v4/runtime/latency_experiment'
ASSETS=DOC/'assets_v4_chong_day_gap_bung'
ASSETS.mkdir(exist_ok=True)
STEM='Bao_cao_V4_Chong_day_Gap_bung_va_Thuc_nghiem_Web'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def pct(value):return f'{value*100:.2f}%'.replace('.',',')
def number(value,digits=1):return f'{value:.{digits}f}'.replace('.',',')
def table(headers,rows):
    def line(row):return '| '+' | '.join(str(x).replace('|','/') for x in row)+' |'
    return '\n'.join([line(headers),line(['---']*len(headers))]+[line(r) for r in rows])
def q(values):
    a=np.asarray([v for v in values if v is not None],float)
    assert len(a)
    return {'n':len(a),'mean':float(a.mean()),'p50':float(np.percentile(a,50)),
            'p95':float(np.percentile(a,95)),'min':float(a.min()),'max':float(a.max())}
def picture(path,caption):
    path=Path(path);assert path.is_file(),path
    relative=Path('..')/path.relative_to(ROOT)
    return f'![{caption}]({relative.as_posix()})\n\n*{caption}*'


def main():
    measurement=read(TIMING/'web_latency_raw.json')
    assert measurement.get('complete') and len(measurement['trials'])==12
    reports={s:read(OUT/f'test_report_{s}_v4_multihead.json') for s in ('pushup','crunch')}
    contracts={s:read(ROOT/f'smart_gym_test_rtmpose_v4/weights/{s}_v4_contract.json') for s in reports}
    history={s:read(OUT/f'training_history_{s}_v4.json') for s in reports}
    names={'pushup':'Chống đẩy','crunch':'Gập bụng ngược'}
    conditions=[]
    csv_rows=[]
    for stem in reports:
        for mode in ('video','camera_simulated'):
            trials=[r for r in measurement['trials'] if r['stem']==stem and r['mode']==mode]
            assert len(trials)==3 and all(not r['errors'] and not r['javascript_errors'] for r in trials)
            frames=[f for t in trials for f in t['frames'] if 3000<=f['elapsed_ms']<15000]
            updates=[];intervals=[]
            for t in trials:
                previous=None;fresh=[]
                for f in t['frames']:
                    if f['prediction_signature'] and f['prediction_signature']!=previous:
                        previous=f['prediction_signature']
                        if f['elapsed_ms']>=3000:fresh.append(f)
                updates.extend(fresh)
                intervals.extend(np.diff([f['received_elapsed_ms'] for f in fresh]).tolist())
                csv_rows.append({'exercise':stem,'source':mode,'repeat':t['repeat'],
                                 'frames':t['summary']['steady_frames'],'analysis_fps':t['summary']['analysis_fps'],
                                 'capture_receive_p50_ms':t['summary']['capture_to_receive_ms']['p50'],
                                 'capture_receive_p95_ms':t['summary']['capture_to_receive_ms']['p95'],
                                 'first_result_ms':t['summary']['first_scored_result_ms']})
            whole=[r for r in measurement['whole_video_trials'] if r['exercise']==trials[0]['exercise']]
            row={'stem':stem,'mode':mode,'name':names[stem]+(' – video' if mode=='video' else ' – camera mô phỏng'),
                 'steady_frames':len(frames),'analysis_fps':q([t['summary']['analysis_fps'] for t in trials]),
                 'display_fps':q([float(t['ui_metrics']['display-fps']) for t in trials]),
                 'first_result_ms':q([t['summary']['first_scored_result_ms'] for t in trials]),
                 'fresh_interval_ms':q(intervals),'classifier_ms':q([f['classifier_ms'] for f in updates]),
                 'found_ratio':float(np.mean([f['found'] for f in frames])),
                 'whole_video_ms':q([r['dom_raf_ms'] for r in whole]) if mode=='video' else None,
                 **{k:q([f.get(k) for f in frames]) for k in ('capture_to_receive_ms','capture_to_dom_raf_ms',
                     'capture_to_send_ms','send_to_receive_ms','server_ms','pose_ms')}}
            row['_frame_values']=[f['capture_to_receive_ms'] for f in frames]
            conditions.append(row)
    summary={'protocol':{'trials':12,'seconds_per_trial':15,'steady_excluded_first_seconds':3,
                         'quantiles':'pooled steady frames within each condition; FPS averaged over three trials',
                         'first_result':'click start to first response containing classifier scores',
                         'dom_raf':'capture to next animation callback after result DOM update; not physical display latency'},
             'conditions':[{k:v for k,v in r.items() if not k.startswith('_')} for r in conditions],
             'raw_sha256':hashlib.sha256((TIMING/'web_latency_raw.json').read_bytes()).hexdigest()}
    (TIMING/'web_latency_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    with (TIMING/'web_latency_trials.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(csv_rows[0]));writer.writeheader();writer.writerows(csv_rows)
    labels=['Chống đẩy\nVideo','Chống đẩy\nCamera mô phỏng','Gập bụng\nVideo','Gập bụng\nCamera mô phỏng']
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12,'axes.spines.top':False,'axes.spines.right':False})
    fig,ax=plt.subplots(figsize=(10,5.5))
    ax.boxplot([r['_frame_values'] for r in conditions],tick_labels=labels,whis=(5,95),showfliers=False)
    ax.set(ylabel='Độ trễ từ lấy hình đến nhận kết quả (ms)',title='Độ trễ phản hồi khung hình trên web nội bộ')
    ax.set_ylim(top=max(r['capture_to_receive_ms']['p95'] for r in conditions)*1.35)
    ax.grid(axis='y',alpha=.25)
    for i,r in enumerate(conditions,1):
        ax.text(i,ax.get_ylim()[1]*.95,f'n={r["steady_frames"]}\nP50={r["capture_to_receive_ms"]["p50"]:.1f}\nP95={r["capture_to_receive_ms"]["p95"]:.1f}',ha='center',va='top',fontsize=10)
    fig.tight_layout();fig.savefig(ASSETS/'web_latency_distribution.png',dpi=300,bbox_inches='tight');plt.close(fig)
    fig,axes=plt.subplots(2,1,figsize=(10,8))
    for i,r in enumerate(conditions):
        trials=[t for t in measurement['trials'] if t['stem']==r['stem'] and t['mode']==r['mode']]
        axes[0].scatter([i]*3,[t['summary']['first_scored_result_ms']/1000 for t in trials],s=65,color='#287e83')
        axes[1].scatter([i]*3,[t['summary']['analysis_fps'] for t in trials],s=65,color='#bb773b')
    axes[0].set(ylabel='Thời gian chờ (giây)',title='Kết quả phân loại đầu tiên: ba lượt đo mỗi điều kiện')
    axes[1].set(ylabel='Kết quả khung hình / giây',title='Tốc độ phân tích: ba lượt đo mỗi điều kiện')
    for ax in axes:ax.set_xticks(range(4),labels);ax.grid(axis='y',alpha=.25)
    fig.tight_layout();fig.savefig(ASSETS/'web_first_result_and_fps.png',dpi=300,bbox_inches='tight');plt.close(fig)

    parts=[r'''# BÁO CÁO TỔNG HỢP KẾT QUẢ VÀ CÁC CẢI TIẾN V4

## CHỐNG ĐẨY, GẬP BỤNG NGƯỢC VÀ THỰC NGHIỆM ĐỘ TRỄ TRÊN WEB

Ngày báo cáo: 30/10/2026

## 1. Mục tiêu của phiên bản V4

V4 mở rộng nhận diện chống đẩy và gập bụng ngược theo hướng nhiều nhãn. Mỗi video có thể đồng thời mang nhiều lỗi, thuộc tính hoặc trạng thái. Chống đẩy có 21 nhãn; gập bụng ngược có 19 nhãn. Mục tiêu là giữ các thông tin chi tiết của dữ liệu Qualcomm, giúp kết quả thể hiện được nhiều đặc điểm cùng lúc.

Bên cạnh chất lượng nhận diện, báo cáo đánh giá thời gian phản hồi khi sử dụng hai mô hình trên web. Phép đo bao gồm xử lý khung hình, thời gian chờ kết quả phân loại đầu tiên, khoảng cập nhật kết quả và thời gian phân tích toàn video.

## 2. Thay đổi từ V3 sang V4
''',table(['Nội dung','V3','V4'],[
        ['Cách biểu diễn kết quả','Chọn một trong bốn lớp của từng bài','Điểm và quyết định riêng cho 21/19 nhãn'],
        ['Nhóm nhãn','Các lỗi được gom thành nhóm chính','Tách nhãn theo chú thích Qualcomm; phân biệt lỗi, thuộc tính và trạng thái'],
        ['Chuỗi đầu vào','32 khung mẫu','128 khung mẫu trên toàn đoạn'],
        ['Thông tin bổ sung','Phân loại từ chuỗi khớp','Chuỗi khớp kết hợp 32 đặc trưng ngữ cảnh'],
        ['Mục tiêu học','Một lớp mục tiêu cho mỗi mẫu','Nhiều vị trí nhãn có thể cùng bằng 1'],
        ['Cách quyết định','Ưu tiên lớp có điểm cao nhất','So sánh độc lập từng điểm với ngưỡng riêng'],
        ['Đánh giá','Tỷ lệ đúng một lớp và kết quả từng lớp','F1 theo nhãn, khớp toàn bộ và ma trận 2×2 từng nhãn']]),r'''
Ví dụ, chống đẩy có thể vừa xuống nông vừa nâng hông cao; V4 có thể trả cả hai nhãn. Với gập bụng ngược, nhãn đầu nâng lên được giữ theo mô tả quan sát, không tự chuyển thành kết luận về tổn thương hoặc căng cơ cổ.

## 3. Dữ liệu Qualcomm và ý nghĩa của nhãn

### 3.1. Cách xây dựng dữ liệu

Theo mục 3.2 của [bài báo Qualcomm](https://arxiv.org/html/2407.08101v3), biến thể bài tập được xác định có tham vấn huấn luyện viên; người tham gia nhận hướng dẫn và video mẫu. Video cùng nhãn được kiểm tra thủ công. Báo cáo sử dụng các chú thích này làm đáp án đánh giá, không mặc định đó chỉ là yêu cầu quay chưa được xác nhận.

[Trang dữ liệu Qualcomm](https://www.qualcomm.com/developer/software/qevd-dataset) mô tả mỗi video có một hoặc nhiều nhãn. Tệp nguồn được đọc để tạo dữ liệu huấn luyện riêng, không sửa trực tiếp nội dung gốc.

### 3.2. Nhãn lỗi, nhãn thuộc tính và nhãn trạng thái

Diễn giải nhãn dựa trên labels (mã nhãn) và labels_descriptive (mô tả nhãn). Một số ví dụ:
''',table(['Bài','Mã nhãn và chú thích','Cách hiểu trong hệ thống'],[
        ['Chống đẩy','90 degrees (90 độ)','Thuộc tính về độ sâu; không khẳng định mọi tiêu chí đều đúng'],
        ['Chống đẩy','deep (xuống sâu)','Mô tả nguồn nêu xuống quá sâu; được xếp vào nhãn lỗi'],
        ['Chống đẩy','butt sinking (hông bị võng xuống)','Nhãn lỗi về tư thế hông'],
        ['Chống đẩy','waiting position (tư thế chờ)','Trạng thái chống tay chờ; cần ngữ cảnh toàn đoạn'],
        ['Gập bụng ngược','head up (đầu nâng lên)','Thuộc tính quan sát; không tự suy ra lỗi y khoa'],
        ['Gập bụng ngược','frontal (bàn chân hướng về camera)','Thuộc tính vị trí so với máy quay'],
        ['Gập bụng ngược','height=1…5 (mức nâng 1…5)','Giữ thang nhãn gốc; không đổi sang centimét hoặc số độ'],
        ['Gập bụng ngược','not raising hips (chưa nâng hông)','Mô tả hông còn trên sàn; được đưa vào nhóm lỗi cần kiểm tra']]),r'''
Một video có nhãn lỗi không có nghĩa các tiêu chí còn lại đã được xác nhận đúng. Hai bài này không được bổ sung một nhãn đúng toàn bộ do nhóm tự suy ra.

### 3.3. Cách sử dụng nhãn trong V4

Mỗi video chống đẩy được biểu diễn bằng 21 vị trí nhãn; gập bụng ngược bằng 19 vị trí. Nhãn có trong danh sách được ghi là 1; nhãn không có được ghi là 0. Video chỉ có một nhãn vẫn tham gia huấn luyện bình thường. Cách học phản ánh danh sách chú thích, không mở rộng việc không có nhãn thành khẳng định kỹ thuật đúng.

## 4. Dữ liệu sử dụng và phân chia các tập
''',table(['Tập dữ liệu','Chống đẩy','Gập bụng ngược','Tổng'],[
        ['Train (huấn luyện)','3.391','2.700','6.091'],['Validation (xác thực)','598','476','1.074'],
        ['Test (kiểm tra)','261','199','460'],['Tổng video sử dụng','4.250','3.375','7.625']]),r'''
Tập huấn luyện cập nhật trọng số. Tập xác thực chọn mô hình và ngưỡng. Tập kiểm tra chỉ dùng đánh giá sau khi hoàn tất lựa chọn. Các tập tách theo video và nội dung; chưa có cơ sở xác nhận khả năng nhận diện trên nhóm người hoàn toàn khác.

## 5. Các thay đổi trong mô hình và huấn luyện

### 5.1. Thông tin về chuyển động và tư thế

Cả hai bài dùng 128 khung lấy mẫu trên toàn đoạn, giữ cả thời gian chờ và các pha chuyển động. Chuỗi 17 khớp được ghép với 32 đặc trưng ngữ cảnh. Chống đẩy có thông tin góc khuỷu, thẳng hàng thân, vị trí hông, khoảng cách tay và mức quan sát khớp. Gập bụng ngược có thông tin góc hông, góc gối, mức di chuyển hông và chân, đối xứng và tốc độ thay đổi vị trí.

ST-GCN++ (mạng đồ thị không gian và thời gian) học quan hệ giữa khớp và biến đổi theo thời gian. Thông tin học được kết hợp với đặc trưng bổ sung để tạo điểm từng nhãn. Đặc trưng hình học là đầu vào hỗ trợ học, không phải quy tắc tự tạo nhãn chuẩn.

### 5.2. Học đồng thời các nhãn

Sử dụng weighted binary cross-entropy (sai số nhị phân có trọng số): nhãn nguồn có nhưng điểm thấp sẽ tạo yêu cầu tăng điểm; nhãn nguồn không ghi nhưng điểm cao sẽ tạo yêu cầu giảm điểm. Trọng số nhãn chỉ tính từ tập huấn luyện, giúp giảm ảnh hưởng mất cân bằng. Cách này không thay thế được dữ liệu khi nhãn có quá ít mẫu.
''',table(['Thiết lập','Giá trị'],[
        ['Số vòng tối đa','70'],['Batch size (số mẫu trong một lô)','32'],
        ['AdamW (thuật toán cập nhật trọng số)','Tốc độ học ban đầu 0,001, giảm dần; có điều chuẩn trọng số'],
        ['Tăng cường dữ liệu','Đối xứng trái–phải và nhiễu tọa độ nhỏ'],
        ['Chọn mô hình','AP (điểm xếp hạng nhãn) trung bình trên nhãn có mẫu dương xác thực'],
        ['Early stopping (dừng sớm)','Không cải thiện chỉ số chọn mô hình trong 16 vòng liên tiếp']]),r'''
Chống đẩy học 53 vòng và chọn vòng 37; gập bụng ngược học 58 vòng và chọn vòng 42. Các vòng sau vẫn có thể giảm sai số học nhưng không cải thiện khả năng khái quát, nên không mặc định dùng vòng cuối.

### 5.3. Chọn ngưỡng cho từng nhãn

Sau khi chọn trọng số, thử các mốc từ 10% đến 90% trên tập xác thực, bước 2,5 điểm phần trăm; chọn riêng mốc theo F1 (điểm cân bằng giữa báo đúng và tìm đủ nhãn). Giữ nguyên ngưỡng khi đánh giá. Nguyên tắc tách điểm dự đoán và quyết định, đồng thời dùng dữ liệu riêng để chọn ngưỡng, được trình bày trong [tài liệu scikit-learn](https://scikit-learn.org/stable/modules/classification_threshold.html).

Ví dụ, chống đẩy có ngưỡng xuống nông 50% và hông nâng quá cao 77,5%. Nếu hai điểm cùng vượt ngưỡng, cả hai nhãn được báo. Điểm các nhãn không cần cộng thành 100%; chưa được hiệu chuẩn để hiểu là xác suất kết luận đúng.

## 6. Kết quả đánh giá V4

### 6.1. Kết quả tổng hợp trên tập kiểm tra
''',table(['Bài tập','Số video','F1 gộp','F1 trung bình nhãn','Khớp toàn bộ'],[
        [names[s],reports[s]['test']['samples'],pct(reports[s]['test']['micro_f1']),pct(reports[s]['test']['macro_f1']),pct(reports[s]['test']['exact_match'])] for s in reports]),r'''
Micro F1 (F1 gộp) tổng hợp các quyết định nhãn. Macro F1 (F1 trung bình nhãn) cho mỗi nhãn vai trò như nhau. Exact match (khớp toàn bộ) chỉ tính đúng khi nhận đủ và không báo thừa danh sách chú thích. Một video có nhiều lỗi vẫn được tính khớp nếu mô hình nhận đúng danh sách; đây không phải tỷ lệ người tập đúng kỹ thuật.

Chống đẩy có 109/261 video khớp toàn bộ; gập bụng ngược có 70/199. F1 trung bình tính trên đủ 21/19 nhãn, trong đó nhãn không có mẫu dương kiểm tra có F1 bằng 0. Nếu chỉ lấy nhãn có mẫu dương, hai kết quả lần lượt là 59,09% trên 20 nhãn và 65,21% trên 18 nhãn.

Các chỉ số trên tính trước bước chặn chuỗi khớp yếu. Khi áp dụng điều kiện khớp như ứng dụng và vẫn giữ các video bị chặn trong mẫu đánh giá, F1 gộp lần lượt là 60,24% và 63,71%.

### 6.2. Đối chiếu với V3 và kiểm tra video thực tế

V3 ghi nhận accuracy (tỷ lệ chọn đúng một lớp) 57,77% cho chống đẩy và 69,15% cho gập bụng ngược. Không so trực tiếp với F1 của V4 vì số nhãn, mục tiêu và tập đánh giá khác nhau. Thay đổi được xác nhận là khả năng học và trả nhiều nhãn đồng thời; chưa có cơ sở quy đổi thành mức tăng độ chính xác so với V3.

Khi kiểm tra thêm video thực tế, F1 gộp chống đẩy là 66,04%, gập bụng ngược là 47,73%; khớp toàn bộ lần lượt 20% và 10%. Mức giảm của gập bụng cho thấy cần tiếp tục kiểm tra khả năng áp dụng ngoài điều kiện kiểm tra nội bộ. Nhóm video này có độ phủ nhãn giới hạn.

## 7. Kết quả từng nhãn và nhận xét
''']
    for i,s in enumerate(reports,1):
        parts += [f'### 7.{i}. {names[s]}',table(['Nhãn','Precision (độ chuẩn xác)','Recall (độ bao phủ)','F1','Số video có nhãn'],[
            [r['name_vi'],pct(r['precision']),pct(r['recall']),pct(r['f1']),r['support']] for r in reports[s]['test']['per_label'].values()])]
        parts += [('Chống đẩy phân biệt tốt hơn các chuyển động rõ như dịch chuyển hai bên, chuyển sang tư thế em bé và tư thế chờ. '
                   'Đặt tay hẹp đạt F1 97,14% trên 17 mẫu. Tuy nhiên, hông võng chỉ đạt 16,22%, đầu chuyển động 22,22%, đầu cúi 0%. '
                   'Các kết quả 100% ở một số nhãn có ít mẫu không chứng minh độ ổn định trên mọi người tập.') if s=='pushup' else
                  ('Gập bụng ngược có kết quả tốt hơn ở duỗi chân (89,66%), chưa nâng hông (78,57%) và đầu nâng lên (86,15%). '
                   'Các mức nâng 1–5 còn lẫn nhau, F1 khoảng 31,37–63,64%. Nhãn đùi không chuyển động chỉ có một mẫu kiểm tra và F1 bằng 0; '
                   'chưa đủ dữ liệu để đánh giá ổn định nhóm này.')]
    parts += [r'''### 7.3. Những nhãn cần lưu ý

Nhãn dáng tập thiếu ổn định của chống đẩy và không nhìn thấy rõ của gập bụng ngược chưa có mẫu dương kiểm tra. Không thể dùng F1 bằng 0 của hai hàng này để kết luận khả năng tìm thấy nhãn. Nhãn không nhìn thấy rõ của gập bụng chỉ có sáu mẫu huấn luyện và một mẫu xác thực, nên ngưỡng hiện tại còn ít căn cứ.

## 8. Giải thích bảng và biểu đồ

### 8.1. Cách đọc kết quả từng nhãn

Precision (độ chuẩn xác) cho biết trong những video mô hình báo nhãn, bao nhiêu video khớp chú thích. Recall (độ bao phủ) cho biết mô hình tìm được bao nhiêu trong các video có nhãn. F1 tổng hợp hai mặt; support (số mẫu có nhãn) cho biết lượng dữ liệu làm căn cứ.

### 8.2. Confusion matrix (ma trận nhầm lẫn)

Mỗi nhãn có bảng 2×2 riêng. Hàng biểu thị chú thích nguồn, cột biểu thị dự đoán. Ví dụ nhãn hông võng của chống đẩy:
''']
    with np.load(OUT/'test_predictions_pushup_v4.npz') as saved:
        matrices=multilabel_confusion_matrix(saved['targets'],saved['probabilities']>=saved['thresholds'])
    j=[r['key'] for r in contracts['pushup']['labels']].index('butt_sinking');m=matrices[j]
    parts += [table(['Nhãn nguồn / Dự đoán','Không báo','Có báo'],[
        ['Không ghi hông võng',int(m[0,0]),f'{int(m[0,1])}: báo thừa'],
        ['Có ghi hông võng',f'{int(m[1,0])}: bỏ sót',f'{int(m[1,1])}: nhận đúng']]),
        f'Trong {int(m[1].sum())} video có nhãn, mô hình nhận đúng {int(m[1,1])} và bỏ sót {int(m[1,0])}. '
        f'Có {int(m[0,1])} video bị báo nhãn không được nguồn ghi. Hàng không ghi nhãn phản ánh chú thích, không chứng minh toàn bộ tiêu chí tư thế đã được kiểm tra là đúng.',
        picture(OUT/'per_label_confusion_matrices_pushup/confusion_matrix_10_butt_sinking.png','Hình 1. Ma trận riêng nhãn hông bị võng xuống.'),
        '### 8.3. Loss curve (đường sai số)',
        'Đường huấn luyện giảm nhưng đường xác thực tăng ở các vòng sau là dấu hiệu overfitting (học quá sát dữ liệu huấn luyện). '
        'Vạch đánh dấu thể hiện vòng chọn theo AP (điểm xếp hạng nhãn) xác thực; không nhất thiết trùng vòng có sai số thấp nhất. '
        'F1 trên đường học dùng ngưỡng 0,5 để theo dõi; bảng kết quả cuối dùng ngưỡng riêng đã chọn.',
        picture(OUT/'loss_curve_best_stgcnpp_pushup_v4.png','Hình 2. Quá trình huấn luyện chống đẩy; chọn vòng 37 trong 53 vòng.'),
        picture(OUT/'loss_curve_best_stgcnpp_crunch_v4.png','Hình 3. Quá trình huấn luyện gập bụng ngược; chọn vòng 42 trong 58 vòng.'),
        picture(OUT/'precision_recall_f1_best_stgcnpp_pushup_v4.png','Hình 4. Kết quả từng nhãn chống đẩy.'),
        picture(OUT/'precision_recall_f1_best_stgcnpp_crunch_v4.png','Hình 5. Kết quả từng nhãn gập bụng ngược.'),r'''
## 9. Thay đổi trong ứng dụng kiểm thử

Hai bài được cập nhật vào chương trình Python và web với đầy đủ 21/19 hàng nhãn, điểm, ngưỡng và trạng thái. Kết quả lỗi được phân biệt với thuộc tính. Chế độ toàn video giữ ngữ cảnh cho dừng sớm, vào tư thế và tốc độ; chế độ trực tiếp chỉ áp dụng các nhãn phù hợp.

Khi thiếu khớp, ứng dụng thông báo chưa đủ dữ liệu và xóa kết quả trực tiếp cũ. Bộ đếm ưu tiên bên cơ thể đủ khớp, không tự hoàn thành lượt chỉ vì đổi bên theo dõi. Đây là cách giảm kết luận từ quan sát yếu, chưa sửa được khớp đoán sai nhưng vẫn có điểm tin cậy cao.

Toàn bộ 58 kiểm thử chương trình đều đạt. Trên tập kiểm tra hai bài mới, CPU (bộ xử lý trung tâm) và GPU (bộ xử lý đồ họa) không khác quyết định nhãn. Kiểm thử chức năng và tính nhất quán triển khai không đồng nghĩa mọi dự đoán đều đúng.

## 10. Thực nghiệm độ trễ khi sử dụng trên web

### 10.1. Mục tiêu và điều kiện đo

Đánh giá thời gian từ lấy hình tại trình duyệt đến khi nhận và cập nhật kết quả, thay vì chỉ xác nhận giao diện có kết nối được mô hình. Trình duyệt và máy chủ chạy trên cùng máy qua địa chỉ nội bộ; mô hình chạy bằng GPU (bộ xử lý đồ họa).
''',f'Cấu hình được ghi nhận: CPU (bộ xử lý trung tâm) {measurement["hardware"]["cpu"]}; '
        f'GPU (bộ xử lý đồ họa), trình điều khiển và bộ nhớ lần lượt là {measurement["hardware"]["gpu_driver_memory"]}.',
        f'Trình duyệt Chromium (bộ máy trình duyệt) phiên bản {measurement["browser_version"]}, chạy không mở cửa sổ. '
        'Có một phiên phân tích được công cụ đo điều khiển; tại đầu mỗi lượt, máy chủ ghi nhận tổng cộng hai kết nối, gồm phiên đo và một kết nối có sẵn. '
        'Không đóng cưỡng bức trang của người dùng hoặc các chương trình khác, nên đây không phải phép đo trên máy được cô lập tải hoàn toàn.',r'''
Mỗi bài được đo ở hai nguồn: tệp video và camera mô phỏng từ video. Mỗi điều kiện lặp ba lần, mỗi lần 15 giây; bỏ ba giây đầu khi tổng hợp phản hồi ổn định. Tổng cộng 12 lượt và 180 giây theo dõi. Mỗi bài sử dụng một video có đủ khớp, lặp nội dung để duy trì thời lượng; đây là phép đo tốc độ với tải xác định, không phải bổ sung mẫu đánh giá độ chính xác.

Ảnh thực gửi của chống đẩy có kích thước 640×480; gập bụng ngược 640×360, giống nhau giữa hai nguồn trong các lượt đo. Ảnh giữ cạnh dài tối đa 640 điểm ảnh, nén JPEG (định dạng ảnh nén) chất lượng 0,82. Mỗi phiên chỉ có một khung đang chờ phản hồi, giới hạn gửi tối đa 25 lần/giây. Mô hình đã nạp sẵn; không tính thời gian khởi động máy chủ.

### 10.2. Các đại lượng và cách đo
''',table(['Đại lượng','Ranh giới phép đo'],[
        ['Phản hồi khung hình','Từ lấy hình lên vùng ảnh đệm đến nhận đúng phản hồi của khung đó; gồm chuẩn bị ảnh, truyền, chờ và xử lý'],
        ['Cập nhật giao diện','Từ lấy hình đến chu kỳ vẽ tiếp theo sau khi nội dung kết quả được cập nhật; không phải độ trễ màn hình vật lý'],
        ['Xử lý máy chủ','Từ giải mã ảnh đến tạo dữ liệu phản hồi trong hàm xử lý; không gồm toàn bộ thời gian truyền hoặc chờ khóa chung'],
        ['Tìm khớp','Thời gian tìm người và khớp bên trong xử lý máy chủ'],
        ['Kết quả đầu tiên','Từ bấm bắt đầu đến nhận kết quả có điểm phân loại; gồm thời gian thu chuỗi khớp'],
        ['Khoảng cập nhật nhãn','Khoảng cách giữa các phản hồi có bộ điểm phân loại mới; không đếm việc gửi lại kết quả đã lưu'],
        ['Phân tích toàn video','Từ bắt đầu gửi tệp đến cập nhật kết quả toàn đoạn; gồm gửi, đọc video, tìm khớp, phân loại và hiển thị']]),r'''
Các mốc phía trình duyệt dùng performance.now (đồng hồ đo thời gian đơn điệu) trên cùng đồng hồ, không trừ thời gian của hai máy khác nhau. requestAnimationFrame (lệnh hẹn xử lý ở chu kỳ vẽ tiếp theo) giúp ghi mốc sau khi cập nhật nội dung; không đo trực tiếp thời điểm màn hình phát sáng. Cách hoạt động được mô tả trong [tài liệu đồng hồ trình duyệt](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) và [tài liệu chu kỳ vẽ](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

Đơn vị ms là mili giây; 1.000 ms bằng một giây. P50 (trung vị) biểu thị mức giữa của các mẫu đo; P95 (phân vị 95%) biểu thị mức mà khoảng 95% mẫu không vượt quá. Các phân vị phản hồi được tính từ toàn bộ khung trong phần đo ổn định của ba lượt; tốc độ phân tích lấy trung bình ba lượt.

### 10.3. Kết quả phản hồi khung hình
''',table(['Bài / nguồn','Số khung','Phân tích/giây','Phản hồi P50/P95 (ms)','Giao diện P50/P95 (ms)'],[
        [r['name'],r['steady_frames'],number(r['analysis_fps']['mean']),
         f'{number(r["capture_to_receive_ms"]["p50"])}/{number(r["capture_to_receive_ms"]["p95"])}',
         f'{number(r["capture_to_dom_raf_ms"]["p50"])}/{number(r["capture_to_dom_raf_ms"]["p95"])}'] for r in conditions]),
        f'Tốc độ hình ảnh hiển thị ở cuối các lượt đo dao động trong khoảng '
        f'{number(min(t["display_fps"]["min"] for t in conditions))}–{number(max(t["display_fps"]["max"] for t in conditions))} '
        'FPS (khung hình mỗi giây). Đây là tốc độ trình duyệt trình bày hình, khác tốc độ xử lý trả kết quả trong bảng.',
        picture(ASSETS/'web_latency_distribution.png','Hình 6. Phân bố phản hồi khung hình; hộp thể hiện vùng 25–75%, râu thể hiện mức 5–95%.'),
        '### 10.4. Phân tách thời gian xử lý',
        table(['Bài / nguồn','Chuẩn bị ảnh TB (ms)','Máy chủ TB (ms)','Tìm khớp TB (ms)','Phân loại TB (ms)'],[
            [r['name'],number(r['capture_to_send_ms']['mean']),number(r['server_ms']['mean']),
             number(r['pose_ms']['mean']),number(r['classifier_ms']['mean'])] for r in conditions]),r'''
TB là trung bình. Thời gian tìm khớp là một phần của thời gian máy chủ, không cộng thêm lần nữa. Phân loại chỉ được đo ở các lần có bộ điểm mới; không phải khung nào cũng chạy phân loại. Chênh lệch giữa phản hồi trình duyệt và xử lý máy chủ còn gồm truyền, chờ và xử lý dữ liệu, nên không gọi riêng phần này là độ trễ mạng.

### 10.5. Thời gian chờ kết quả đầu tiên và phân tích toàn video
''',table(['Bài / nguồn','Kết quả đầu P50 (giây)','Khoảng ba lượt (giây)','Cập nhật nhãn P50/P95 (giây)'],[
        [r['name'],number(r['first_result_ms']['p50']/1000,2),
         f'{number(r["first_result_ms"]["min"]/1000,2)}–{number(r["first_result_ms"]["max"]/1000,2)}',
         f'{number(r["fresh_interval_ms"]["p50"]/1000,2)}/{number(r["fresh_interval_ms"]["p95"]/1000,2)}'] for r in conditions]),
        picture(ASSETS/'web_first_result_and_fps.png','Hình 7. Ba lần đo thời gian chờ kết quả đầu tiên và tốc độ phân tích cho mỗi điều kiện.'),r'''
Ứng dụng cần ít nhất 20 khung quan sát, trải trên tối thiểu một giây trước khi phân loại đoạn gần đây. Sau đó chỉ tính bộ điểm mới khi thời gian nguồn tăng ít nhất 0,75 giây; giữ cửa sổ chuyển động dài tối đa sáu giây. Vì vậy, tốc độ trả khớp và tốc độ cập nhật nhãn là hai đại lượng khác nhau. Phản hồi một khung nhanh không có nghĩa nhãn lỗi cũng xuất hiện ngay trong cùng khoảng thời gian đó.
''',table(['Bài','Thời lượng video đo','Số lượt','Toàn video P50/P95 (giây)'],[
        [names[s],f'{number(measurement["fixtures"][s]["fixture_duration_s"],1)} giây',3,
         f'{number(next(r for r in conditions if r["stem"]==s)["whole_video_ms"]["p50"]/1000,2)}/'
         f'{number(next(r for r in conditions if r["stem"]==s)["whole_video_ms"]["p95"]/1000,2)}'] for s in reports]),r'''
Phân tích toàn video lấy mẫu cả đoạn theo cấu hình mô hình nên không đồng nghĩa thời gian xử lý tăng tuyến tính theo thời lượng. Không so tốc độ này với tốc độ phát video hoặc thời gian phản hồi một khung. Mỗi bài chỉ có ba lượt đo toàn video; phân vị trong bảng mô tả các lượt đã thử, chưa đủ để kết luận phân bố độ trễ dài hạn.

### 10.6. Nhận xét và giới hạn phép đo

Phần tìm người và khớp chiếm phần lớn thời gian xử lý máy chủ trong các lượt đo. Giao diện có thể tiếp tục phát hình trong khi chờ phản hồi vì không gửi và chờ xử lý mọi khung của video. Dữ liệu hiện tại hỗ trợ khả năng quan sát và phản hồi theo đoạn chuyển động trên máy thử, chưa chứng minh phản hồi tức thời cho mọi thay đổi kỹ thuật.

Đây là số liệu trên máy phát triển, qua kết nối nội bộ, với video lặp và camera mô phỏng. Chưa đo webcam vật lý, đường truyền Internet, điện thoại, máy cấu hình thấp, nhiều phiên phân tích đồng thời hoặc tải kéo dài. Mốc giao diện không bao gồm trễ cảm biến camera và trễ màn hình vật lý. Kết quả đầu tiên chưa chứng minh mô hình đã phát hiện đúng thời điểm bắt đầu một lỗi; muốn đo điều đó cần video có mốc lỗi được gán nhãn theo thời gian.

## 11. Các vấn đề và vướng mắc trong quá trình thực hiện

### 11.1. Khớp bị khuất và góc quay chưa phù hợp

Chống đẩy và gập bụng ngược có cơ thể gần sàn; vai, tay, hông hoặc chân dễ che nhau. Góc quay chính diện khó quan sát độ thẳng thân; góc bên khó phân biệt khoảng cách hai tay. Trong nhiều video, mỗi người chỉ có một góc quay, không có ảnh đồng thời từ góc khác để đối chiếu.

Khi đầu vào sai, chuỗi ảnh hưởng là: khớp nhảy tọa độ hoặc nhầm bên → đặc trưng biên độ và tốc độ sai → phân đoạn và phân loại sai. Điểm tin cậy cao chưa bảo đảm vị trí khớp đúng. Mức quan sát khớp hiện tại không phải phép đo độ chính xác khớp có đáp án tọa độ chuẩn.

### 11.2. Nhãn hiếm và độ chính xác chưa đồng đều

Trọng số nhãn hỗ trợ mất cân bằng nhưng không tạo thêm ví dụ thực tế. Các nhãn đầu, hông võng và mức nâng trung gian vẫn cần phân tích báo thừa, bỏ sót. Không dùng điểm cao trên ít mẫu để kết luận mô hình đã ổn định ở mọi điều kiện.

### 11.3. Phản hồi theo đoạn và đánh giá từng lượt

Mô hình được học theo nhãn toàn video. Kết quả cửa sổ trực tiếp hoặc từng lượt chưa có đánh giá tương đương theo nhãn từng lượt. Dù truyền và xử lý khung nhanh, vẫn cần chờ chuỗi chuyển động. Chưa đo được độ trễ phát hiện lỗi từ đúng thời điểm lỗi bắt đầu; không thay đại lượng này bằng thời gian phản hồi khung.

### 11.4. Hướng xử lý tiếp theo

Kiểm tra chuỗi khớp ở các trường hợp báo sai; phân nhóm theo góc quay, ánh sáng và mức che khuất để xác định giới hạn. Đánh giá trên webcam thật và ghi mốc thời gian các lỗi cần theo dõi. Đo thêm trên nhiều cấu hình thiết bị và điều kiện mạng. Chỉ thực hiện fine-tuning (huấn luyện tinh chỉnh) khi đã xác định nguyên nhân và có dữ liệu phù hợp; nhãn tự tạo bằng quy tắc cần được xác minh trước khi dùng làm đáp án học.

## 12. Nhận xét chung
''',table(['Nội dung','Kết quả đạt được','Điểm còn hạn chế'],[
        ['Nhận diện nhiều nhãn','Hai bài hỗ trợ đồng thời 21/19 nhãn','Một số nhãn còn yếu hoặc thiếu mẫu kiểm tra'],
        ['Đánh giá mô hình','Có kết quả từng nhãn, ma trận và đường sai số','Chưa xác nhận mức tăng chính xác so với V3 trên cùng bài toán'],
        ['Sử dụng trên web','Đã đo phản hồi khung, chờ chuỗi và phân tích toàn video','Chưa đo webcam thật và điều kiện triển khai rộng'],
        ['Chất lượng đầu vào','Có chặn quan sát yếu và hạn chế giữ kết quả cũ','Chưa sửa được mọi khớp bị che hoặc bám nhầm người']]),r'''
V4 mở rộng được phạm vi nhãn của chống đẩy và gập bụng ngược, đồng thời có số liệu thực nghiệm về thời gian sử dụng trên web. Hai nhóm kết quả cần được xem riêng: phản hồi nhanh không chứng minh nhận diện chính xác; nhận diện đúng trên tập kiểm tra cũng chưa đủ để kết luận phản hồi kịp thời trong mọi điều kiện tập.

## Tài liệu tham khảo và dữ liệu thực nghiệm

1. Sunny Panchal và cộng sự. What to Say and When to Say it: Live Fitness Coaching as a Testbed for Situated Interaction. NeurIPS 2024. [Bài báo](https://arxiv.org/html/2407.08101v3).
2. Qualcomm AI Research. Qualcomm Exercise Video Dataset, mục Classes (các lớp). [Trang dữ liệu chính thức](https://www.qualcomm.com/developer/software/qevd-dataset).
3. scikit-learn. Tuning the decision threshold for class prediction (điều chỉnh ngưỡng quyết định). [Tài liệu chính thức](https://scikit-learn.org/stable/modules/classification_threshold.html).
4. MDN Web Docs. [performance.now (đồng hồ trình duyệt)](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now) và [requestAnimationFrame (hẹn chu kỳ vẽ)](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).

Số liệu mô hình được tính từ đầu ra đã lưu trong `stgcn_model_training/outputs/v4`. Dữ liệu từng khung và từng lượt đo web lưu tại `smart_gym_web_v4/runtime/latency_experiment/web_latency_raw.json`; số liệu tổng hợp tại `web_latency_summary.json`, bảng từng lượt tại `web_latency_trials.csv`. Mã đo là `smart_gym_web_v4/tests/measure_web_latency.py`. Các phép đo không thay đổi trọng số mô hình hoặc tệp nhãn gốc.
''']
    md='\n\n'.join(parts)+'\n';path=DOC/(STEM+'.md');path.write_text(md,encoding='utf-8')
    export_docx(path)
    print(json.dumps(summary,ensure_ascii=False,indent=2))


def export_docx(path, minimum_tables=14, expected_figures=7):
    doc=Document();section=doc.sections[0]
    section.left_margin=Cm(2.2);section.right_margin=Cm(1.8);section.top_margin=Cm(2);section.bottom_margin=Cm(2)
    normal=doc.styles['Normal'];normal.font.name='Times New Roman';normal.font.size=Pt(12)
    normal.paragraph_format.line_spacing=1.15;normal.paragraph_format.space_after=Pt(6)
    for name,size in [('Title',22),('Heading 1',16),('Heading 2',14)]:
        style=doc.styles[name];style.font.name='Times New Roman';style.font.size=Pt(size);style.font.color.rgb=RGBColor(0,0,0)
    def inline(p,text):
        for piece in re.split(r'(\[[^\]]+\]\([^)]+\)|\*\*.*?\*\*|`[^`]+`)',text):
            link=re.fullmatch(r'\[([^\]]+)\]\(([^)]+)\)',piece)
            if link:
                h=OxmlElement('w:hyperlink');h.set(qn('r:id'),p.part.relate_to(link[2],RT.HYPERLINK,is_external=True))
                r=OxmlElement('w:r');pr=OxmlElement('w:rPr');c=OxmlElement('w:color');c.set(qn('w:val'),'0563C1');pr.append(c);r.append(pr)
                t=OxmlElement('w:t');t.text=link[1];r.append(t);h.append(r);p._p.append(h)
            else:
                bold=piece.startswith('**') and piece.endswith('**');code=piece.startswith('`') and piece.endswith('`')
                r=p.add_run(piece[2:-2] if bold else piece[1:-1] if code else piece);r.bold=bold
    lines=path.read_text(encoding='utf-8').splitlines();i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',c) for c in cells):rows.append(cells)
                i+=1
            t=doc.add_table(rows=1,cols=len(rows[0]));t.style='Table Grid'
            for n,row in enumerate(rows):
                cells=t.rows[0].cells if n==0 else t.add_row().cells
                for cell,value in zip(cells,row):
                    p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(3);p.paragraph_format.line_spacing=1
                    inline(p,value)
                    for r in p.runs:r.font.size=Pt(10);r.bold=n==0
                props=t.rows[n]._tr.get_or_add_trPr();props.append(OxmlElement('w:cantSplit'))
                if n==0:props.append(OxmlElement('w:tblHeader'))
            doc.add_paragraph();continue
        image=re.fullmatch(r'!\[([^\]]*)\]\(([^)]+)\)',line)
        if image:
            p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            p.add_run().add_picture(str((path.parent/image[2]).resolve()),width=Inches(6.25))
        elif line.startswith('# '):
            p=doc.add_paragraph(style='Title');p.alignment=WD_ALIGN_PARAGRAPH.CENTER;inline(p,line[2:])
        elif line.startswith('### '):doc.add_heading(line[4:],level=2)
        elif line.startswith('## '):doc.add_heading(line[3:],level=1)
        else:
            p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
            caption=line.startswith('*') and line.endswith('*')
            inline(p,line[1:-1] if caption else line)
            if caption:
                p.alignment=WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:r.italic=True;r.font.size=Pt(10)
        i+=1
    footer=section.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)
    target=path.with_suffix('.docx');doc.save(target)
    check=Document(target)
    assert len(check.inline_shapes)==expected_figures
    assert len(check.tables)>=minimum_tables


if __name__=='__main__':main()
