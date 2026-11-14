export interface Page<T> { items: T[]; nextCursor: string | null }
export interface PlanItem { exerciseId: string; exerciseNameVi: string; sets: number; targetReps?: number; targetDurationSeconds?: number; restSeconds?: number }
export interface Plan { id: string; name: string; description?: string; exercises: PlanItem[]; status: 'ACTIVE'|'ARCHIVED'; version: number }
export interface RuleInput { planId: string; recurrence: 'ONCE'|'WEEKLY'; timeZone: string; startDate: string; endDate?: string; startLocalTime: string; durationMinutes: number; weekdays?: number[] }
export interface Rule extends RuleInput { id: string; status: 'ACTIVE'|'CANCELED'; version: number; projectionConflicts: {localDate:string;startAt:string;endAt:string;code:string}[] }
export interface Occurrence { id: string; scheduleId: string; planId: string; plannedExercises: PlanItem[]; startAt: string; endAt: string; timeZone: string; status:'SCHEDULED'|'CANCELED'; version:number }
export class WorkoutError extends Error { constructor(readonly status:number,readonly code:string,readonly detail?:string){super(code);} }
export function message(error:unknown) {
  if(!(error instanceof WorkoutError))return 'Kết nối bị gián đoạn. Nội dung đang nhập vẫn được giữ. Hãy thử lại.';
  const messages:Record<string,string>={
    POSE_UNAVAILABLE:'Chưa đọc được kết quả AI. Dữ liệu đang nhập vẫn được giữ; hãy thử lại.',
    NO_LOGGABLE_RESULT:'Kết quả AI chưa có số rep dương để nhập. Bạn có thể ghi nhật ký thủ công.',
    POSE_RESULT_ALREADY_IMPORTED:'Kết quả AI này đã được nhập hoặc vẫn giữ dấu chống trùng sau khi xóa nhật ký.',
    RESULT_EXPIRED:'Kết quả AI đã hết hạn. Nhật ký đã nhập trước đó vẫn được lưu riêng.',
    PROGRESS_UNAVAILABLE:'Dịch vụ nhật ký đang gián đoạn. Nội dung đang nhập vẫn được giữ. Hãy thử lại.',
    SUMMARY_UNAVAILABLE:'Chưa tải được tổng hợp tiến độ. Hãy thử lại.',
    INVALID_SUMMARY_RANGE:'Chọn ngày từ/đến hợp lệ, bao gồm hai đầu, tối đa 366 ngày và múi giờ IANA hợp lệ.',
    PERFORMED_AT_IN_FUTURE:'Thời điểm tập thực tế không được ở tương lai.',DUPLICATE_SET:'Số thứ tự set trong cùng một bài không được trùng.',
    SOURCE_IMMUTABLE:'Nguồn và buổi liên kết của nhật ký không thể thay đổi.',OCCURRENCE_ALREADY_LOGGED:'Buổi tập này đã có nhật ký hoặc đã giữ dấu chống trùng sau xóa.',
    LOG_DELETED:'Nhật ký của lượt lưu này đã bị xóa. Không tạo lại từ lần gửi cũ.',
    VERSION_MISMATCH:'Dữ liệu đã thay đổi ở nơi khác. Nội dung đang nhập vẫn được giữ. Bạn có thể tải phiên bản mới để so sánh.',
    SCHEDULE_OVERLAP:'Khoảng giờ này chồng với một buổi tập khác. Hãy chọn giờ khác. '+(error.detail??''),
    ACTIVE_SCHEDULE_EXISTS:'Chương trình còn lịch đang hoạt động. Hãy hủy lịch trước khi lưu trữ chương trình.',
    EXERCISE_UNAVAILABLE:'Một bài tập đã được gỡ. Hãy chọn bài còn trong thư viện khi thêm mới.',
    PLAN_ARCHIVED:'Chương trình đã được lưu trữ. Hãy chọn chương trình đang hoạt động.',
    SCHEDULE_CANCELED:'Lịch này đã được hủy.',OCCURRENCE_CANCELED:'Buổi tập này đã được hủy.',
    OCCURRENCE_STARTED:'Buổi tập đã bắt đầu, không thể dời hoặc hủy.',SCHEDULE_IN_PAST:'Ngày giờ đã qua. Hãy chọn thời điểm tương lai.',
    INVALID_SCHEDULE:'Kiểm tra ngày giờ, múi giờ IANA và phạm vi lặp.',INVALID_OCCURRENCE:'Giờ mới phải ở tương lai, thời lượng từ 5 đến 240 phút và múi giờ IANA hợp lệ.',
    VALIDATION_ERROR:'Kiểm tra các trường bắt buộc và giới hạn số liệu.',NOT_FOUND:'Không tìm thấy dữ liệu của bạn.',
    UNAUTHENTICATED:'Phiên đã hết hiệu lực. Đăng nhập lại ở tab mới rồi thử lưu, bản nháp được giữ tại đây.',
    INVALID_CURSOR:'Danh sách đã thay đổi. Hãy quay về trang đầu.',IDEMPOTENCY_CONFLICT:'Yêu cầu đã thay đổi. Hãy kiểm tra dữ liệu đã lưu trước khi thử lại.',
    CSRF_REJECTED:'Không xác nhận được yêu cầu. Hãy mở trang từ đúng địa chỉ SmartGym.',RATE_LIMITED:'Bạn thao tác quá nhanh. Hãy chờ rồi thử lại.',
  };
  return messages[error.code]??'Dịch vụ tập luyện đang gián đoạn. Nội dung đang nhập vẫn được giữ. Hãy thử lại.';
}
export async function workout<T>(path:string,{method='GET',body,match,key,signal}:{method?:string;body?:object;match?:string;key?:string;signal?:AbortSignal}={}) {
  const timeout=AbortSignal.timeout(16000);
  const res=await fetch('/api/v1/'+path,{method,cache:'no-store',credentials:'same-origin',signal:signal?AbortSignal.any([signal,timeout]):timeout,
    headers:{...(method==='GET'?{}:{'X-SmartGym-CSRF':'1'}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(match?{'If-Match':match}:{}),...(key?{'Idempotency-Key':key}:{})},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data=res.status===204?undefined:await res.json();
  if(!res.ok)throw new WorkoutError(res.status,data.code,data.detail);
  return {data:data as T,etag:res.headers.get('etag')};
}
