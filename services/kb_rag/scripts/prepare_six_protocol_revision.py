"""Version software semantics separately from the earlier raw source file."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.ingest import build_index,write_json

source=ROOT/'data/raw/smartgym_model_protocol.txt'
target=ROOT/'data/raw/smartgym_model_protocol_20261118_v2.txt'
extra='''

Phân biệt loại nhãn theo label_catalog_v4.json và bộ kiểm tra kb_service/v4.py:
kind=error là nhãn lỗi dự đoán; kind=attribute là nhãn thuộc tính/trạng thái. Không đổi nhãn lỗi thành thuộc tính chỉ vì câu hỏi nhắc góc hoặc tốc độ. Cả hai loại đều là dự đoán lớp chú thích, không phải phép đo cơ sinh học trực tiếp.

Trong label_results, probability là điểm nhãn và threshold là ngưỡng kích hoạt đã đăng ký trong contract. Adapter tính lại kích hoạt từ điểm và ngưỡng; không đọc một nhãn độ sâu như số đo góc khuỷu tay. Một nhãn lỗi về độ sâu không tự cho biết góc khuỷu tay cụ thể; điểm nhãn không có đơn vị độ. Muốn kết luận một góc hoặc cadence đo được phải có trường đo riêng, định nghĩa phép đo và minh chứng kiểm chứng tương ứng.

Định vị triển khai: kb_service/v4.py kiểm tra key, raw_label, kind, probability và threshold; label_catalog_v4.json giữ loại nhãn, ngưỡng, hash và contract_file cho từng bài. Đây là diễn giải hợp đồng phần mềm, không phải nguồn khoa học xác lập biên độ hay tốc độ tối ưu.
'''
target.write_text(source.read_text(encoding='utf-8').rstrip()+extra,encoding='utf-8')
registry=json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))
item=next(s for s in registry if s['id']=='smartgym_model_protocol')
item.update(file=target.name,protocol_revision='2026-11-18-v2',
    acquisition='Local code/contract inspection; software classification and measurement semantics, not an exercise prescription.',
    code_references=['kb_service/v4.py','label_catalog_v4.json','model_contracts/'])
write_json(ROOT/'sources.json',registry)
release=ROOT/'data/releases/six_exercises_20261118_r3'
report=build_index(ROOT,index_dir=release)
print(json.dumps({'index':str(release),'build':report},ensure_ascii=False,indent=2))
