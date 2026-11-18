"""Export the explicit V4 coverage inventory and a readable appendix."""
from pathlib import Path
from kb_service.config import ROOT
from kb_service.ingest import read_json,write_json
from kb_service.v4 import coverage_report

snapshot=read_json(ROOT/'data/index/snapshot.json')
report=coverage_report(snapshot)
write_json(ROOT/'artifacts/v4_coverage.json',report)
lines=['# Liên kết nhãn V4 với kiến thức có nguồn','',
       'Đây là kiểm kê liên kết do người phát triển thiết lập, chưa phải đánh giá độ chính xác hay duyệt chuyên môn.',
       '',f"Phiên bản KB: `{snapshot['version']}`. Có {report['total_labels']} nhãn, trong đó {report['error_labels']} nhãn loại lỗi.",
       '', '| Bài | Tổng nhãn | Nhãn lỗi | Trực tiếp | Một phần | Chưa có |',
       '|---|---:|---:|---:|---:|---:|']
for row in report['exercises']:
    c=row['error_coverage'];lines.append(f"| {row['exercise_code']} | {row['labels']} | {row['errors']} | {c.get('direct',0)} | {c.get('partial',0)} | {c.get('none',0)} |")
lines+=['','Trực tiếp: có tiêu chí nguồn diễn tả nội dung liên quan trực tiếp đến nhãn. Một phần: chỉ có hướng dẫn chung hoặc thiếu định nghĩa/ngưỡng của dataset. Chưa có: không tự đề xuất cách sửa. Các mức này vẫn chờ nhóm/chuyên gia duyệt.',
        '', '## Toàn bộ nhãn', '', '| Bài | Mã nhãn | Loại | Mức liên kết | Tiêu chí | Ghi chú |', '|---|---|---|---|---|---|']
for row in report['rows']:
    lines.append('| '+' | '.join([row['exercise_code'],row['key'],row['kind'],row['coverage'],', '.join(row['criterion_ids']) or '—',row['note_vi'].replace('|','/')])+' |')
(ROOT/'artifacts/v4_coverage.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print({'labels':report['total_labels'],'errors':report['error_labels'],'criteria':len(snapshot['claims']),
       'sources':snapshot['report']['source_count'],'chunks':len(snapshot['chunks'])})
