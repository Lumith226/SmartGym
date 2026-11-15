import type { LabelResultItem, TrainingResult } from '../../lib/training-results';

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 });
const statusLabels: Record<string, string> = {
  insufficient_data: 'Chưa đủ dữ liệu quan sát',
  errors_detected: 'Có nhãn lỗi vượt ngưỡng',
  attributes_detected: 'Đã phân tích nhãn',
  review_needed: 'Cần xem lại kết quả',
};
const scopeLabels: Record<string, string> = { video: 'Toàn video', rep: 'Một lượt', window: 'Đoạn quan sát gần nhất' };
const kindLabels: Record<string, string> = {
  error: 'Lỗi kỹ thuật',
  attribute: 'Thuộc tính',
  positive: 'Dấu hiệu tích cực',
  visibility: 'Khả năng quan sát',
  context: 'Bối cảnh',
};

function numberText(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? decimal.format(value) : null;
}

function labelState(label: LabelResultItem) {
  if (label.supported === false) return label.status || 'Chưa đủ điều kiện';
  if (label.detected === true) return 'Phát hiện';
  return label.detected === false ? 'Chưa phát hiện' : 'Chưa có dữ liệu';
}

export function PoseResultDetails({ entry }: { entry: TrainingResult }) {
  const result = entry.result;
  const labels = Array.isArray(result.label_results) ? result.label_results : [];
  const notes = Array.isArray(result.review_notes) ? result.review_notes.filter(note => typeof note === 'string' && note.trim()) : [];
  const ratio = result.quality?.valid_frame_ratio;
  const duration = numberText(result.duration_seconds);
  const insufficient = result.status === 'insufficient_data' || result.quality?.usable === false;
  const knee = insufficient ? null : numberText(result.biomechanics?.min_knee_angle);
  const lean = insufficient ? null : numberText(result.biomechanics?.max_torso_lean);
  const rows = [
    ['Phạm vi phân tích', scopeLabels[result.scope ?? ''] ?? (entry.scope === 'whole' ? 'Toàn video' : 'Trực tiếp')],
    ['Trạng thái', insufficient ? statusLabels.insufficient_data : statusLabels[result.status ?? '']],
    ['Khung hình hợp lệ', typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? percent.format(ratio) : null],
    ['Thời lượng dữ liệu phân tích', duration === null ? null : duration + ' giây'],
    ['Góc gối nhỏ nhất (2D)', knee === null ? null : knee + '°'],
    ['Độ nghiêng thân lớn nhất (2D)', lean === null ? null : lean + '°'],
  ].filter(([, value]) => value != null);

  return (
    <>
      <section aria-label="Dữ liệu quan sát">
        <h3 className="mb-2 text-sm font-semibold">Dữ liệu quan sát</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-border/60 p-3 text-xs sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {(knee !== null || lean !== null) && (
          <p className="mt-2 text-xs text-muted-foreground">Góc 2D được ước lượng từ khung hình và phụ thuộc góc quay.</p>
        )}
      </section>

      {notes.length > 0 && (
        <section className="rounded-xl border border-border/60 p-3">
          <h3 className="text-sm font-semibold">Ghi chú cần xem lại</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {notes.map((note, index) => <li key={index}>{note}</li>)}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold">Nhãn phân tích</h3>
        {labels.length ? (
          <>
            <p className="my-2 text-xs text-muted-foreground">Điểm dự đoán và ngưỡng áp dụng riêng cho từng nhãn. Chưa phát hiện nhãn lỗi chưa đủ để kết luận động tác đúng.</p>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[460px] text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-2.5">Nhãn</th>
                    <th scope="col" className="p-2.5">Trạng thái</th>
                    <th scope="col" className="p-2.5 text-right">Điểm dự đoán</th>
                    <th scope="col" className="p-2.5 text-right">Ngưỡng</th>
                  </tr>
                </thead>
                <tbody>
                  {labels.map(label => (
                    <tr key={label.key} className="border-t border-border/60">
                      <th scope="row" className="p-2.5 font-medium">
                        {label.name_vi ?? label.name ?? label.key}
                        {kindLabels[label.kind ?? ''] && <span className="mt-0.5 block font-normal text-muted-foreground">{kindLabels[label.kind ?? '']}</span>}
                      </th>
                      <td className="p-2.5">{labelState(label)}</td>
                      <td className="p-2.5 text-right tabular-nums">{numberText(label.probability) ?? '—'}</td>
                      <td className="p-2.5 text-right tabular-nums">{numberText(label.threshold) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Bản kết quả này chưa có dữ liệu nhãn.</p>
        )}
      </section>
    </>
  );
}
