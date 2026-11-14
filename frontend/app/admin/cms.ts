import type { ExerciseImageRoles, ExerciseProfile } from '../exercise-profile';

export type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export const statusNames: Record<Status, string> = { DRAFT: 'Bản nháp', PUBLISHED: 'Đã công bố', ARCHIVED: 'Đã gỡ' };
export type WorkoutType = 'STRENGTH' | 'CARDIO' | 'HIIT' | 'CORE' | 'STRETCHING';
export type FocusArea = 'FULL_BODY' | 'UPPER_BODY' | 'LOWER_BODY' | 'ABS';
export type PoseStyle = 'squat' | 'pushup' | 'plank' | 'jump' | 'pull' | 'lunge' | 'core' | 'barbell';

export interface Draft {
  id: string;
  slug: string;
  nameVi: string;
  nameEn?: string;
  summary: string;
  primaryMuscleIds: string[];
  secondaryMuscleIds?: string[];
  equipmentIds: string[];
  instructions: string[];
  commonMistakes?: string[];
  workoutType?: WorkoutType;
  focusArea?: FocusArea;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  levelSets?: [number, number, number];
  restSeconds?: number;
  poseStyle?: PoseStyle;
  mediaIds?: string[];
  variantIds?: string[];
  sourceRef?: string;
  profile?: ExerciseProfile;
  imageRoles?: ExerciseImageRoles;
}
export interface Exercise extends Draft {
  status: Status;
  draftVersion: number;
  publishedVersion?: number;
  publishedRevision?: string;
  updatedAt: string;
}
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface AuditEntry {
  id: string;
  contentId: string;
  contentType: 'exercise' | 'muscle-group' | 'equipment' | 'exercise-variant' | 'media' | 'import';
  actorUserId: string;
  action: 'CREATE_DRAFT' | 'UPDATE_DRAFT' | 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE' | 'DELETE' | 'RESTORE' | 'RESTORE_REVISION' | 'VALIDATE_IMPORT' | 'APPLY_IMPORT';
  at: string;
  beforeVersion?: number;
  afterVersion?: number;
  sourceVersion?: number;
  revision: string;
  reason?: string;
}
export const identifier = /^[a-z][a-z0-9_]{0,79}$/;
export const exercisePath = (id: string) => '/exercises/' + encodeURIComponent(id);
export const dateLabel = (date: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok',
}).format(new Date(date));

export class CmsError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export function errorMessage(error: unknown): string {
  if (!(error instanceof CmsError)) return 'Kết nối bị gián đoạn. Hãy thử lại.';
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: 'Tài khoản của bạn cần quyền quản trị.',
    UNAUTHENTICATED: 'Phiên đã hết hiệu lực. Hãy đăng nhập lại.',
    NOT_FOUND: 'Không tìm thấy nội dung.',
    INVALID_CURSOR: 'Trang dữ liệu đã thay đổi. Hãy quay về trang đầu.',
    EXERCISE_ID_EXISTS: 'Mã bài tập đã được sử dụng.',
    VERSION_MISMATCH: 'Nội dung đã được thay đổi ở nơi khác. Nội dung đang nhập vẫn được giữ.',
    CONTENT_ID_EXISTS: 'Mã nội dung đã được sử dụng.',
    CONTENT_IN_PUBLIC_USE: 'Nội dung đang được bài công khai sử dụng. Hãy xử lý tham chiếu trước khi lưu trữ.',
    REGION_KEY_UNAVAILABLE: 'Vùng SVG đã được nhóm cơ khác sử dụng.',
    INVALID_EXERCISE_REFERENCE: 'Mã bài tập gốc không hợp lệ.',
    POSE_LINK_EXERCISE_NOT_PUBLIC: 'Chỉ có thể liên kết bài tập đang công bố.',
    POSE_LINK_EXERCISE_IN_USE: 'Bài tập này đã được liên kết với một động tác khác trong phòng tập.',
    POSE_EXERCISE_UNSUPPORTED: 'Pose Engine hiện không hỗ trợ động tác này. Hãy tải lại danh sách.',
    POSE_UNAVAILABLE: 'Chưa kết nối được với Pose Engine. Hãy thử lại.',
    MEDIA_SOURCE_INVALID: 'Nguồn media phải là địa chỉ HTTP hoặc HTTPS hợp lệ.',
    MEDIA_UPLOAD_NOT_READY: 'Tệp tải lên chưa sẵn sàng hoặc không thuộc tài khoản của bạn.',
    IMPORT_PACKAGE_NOT_REGISTERED: 'Không có gói KB khớp phiên bản và mã SHA-256 trong registry.',
    IMPORT_MANIFEST_MISMATCH: 'Mã SHA-256 không khớp nội dung gói KB.',
    CATALOG_IMPORT_NOT_CONFIGURED: 'Máy chủ chưa cấu hình registry gói KB.',
    IMPORT_BASE_CHANGED: 'Bản nháp đã thay đổi sau khi kiểm tra. Cần đăng ký một phiên bản gói mới để kiểm tra lại.',
    IMPORT_NOT_READY: 'Gói chưa sẵn sàng để áp dụng.',
    EXPORT_EXPIRED: 'Bản xuất đã hết hạn.',
    EXPORT_WITHDRAWN: 'Bản xuất đã bị thu hồi do nội dung hoặc quyền media thay đổi.',
    EXPORT_NOT_RETAINED: 'Phiên bản này chưa có bản xuất được lưu.',
    CATALOG_MEDIA_UNAVAILABLE: 'Kho media chưa được cấu hình cho trình duyệt hoặc đang gián đoạn.',
    MEDIA_TOO_LARGE: 'Tệp vượt giới hạn dung lượng.',
    MEDIA_TYPE_UNSUPPORTED: 'Định dạng tệp không được hỗ trợ.',
    MEDIA_UPLOAD_LIMIT: 'Đang có quá nhiều tệp chờ kiểm tra. Hãy thử lại sau.',
    MEDIA_UPLOAD_REJECTED: 'Tệp không đạt kiểm tra.',
    MEDIA_RIGHTS_REVOKED: 'Quyền sử dụng tệp đã bị thu hồi.',
    UPLOAD_EXPIRED: 'Lượt tải tệp đã hết hạn. Hãy chọn tệp và tải lại.',
    MEDIA_NOT_APPROVED: 'Kiểm tra quyền sử dụng và trạng thái công bố trong kho media, hoặc gỡ tệp không đủ điều kiện.',
    INVALID_IMAGE_ROLES: 'Chọn ảnh một tư thế hoặc ảnh bắt đầu và ảnh ở điểm cao nhất. Mỗi ảnh chỉ có một vai trò.',
    VARIANT_NOT_PUBLISHED: 'Kiểm tra biến thể đã được công bố và thuộc bài tập này, hoặc gỡ biến thể không hợp lệ.',
    INVALID_TAXONOMY_REFERENCE: 'Nhóm cơ hoặc dụng cụ không hợp lệ hoặc chưa được công bố.',
    OVERLAPPING_MUSCLES: 'Một nhóm cơ chỉ được chọn làm cơ chính hoặc cơ phụ.',
    SLUG_UNAVAILABLE: 'Đường dẫn này đã thuộc về một bài tập khác.',
    EXERCISE_CLASSIFICATION_REQUIRED: 'Chọn loại hình, trọng tâm và độ khó trước khi công bố.',
    NO_PUBLISHABLE_DRAFT: 'Hãy lưu thay đổi vào bản nháp trước khi công bố.',
    IDEMPOTENCY_CONFLICT: 'Yêu cầu này đã thay đổi. Hãy kiểm tra trạng thái bài tập trước khi thử lại.',
    VALIDATION_ERROR: 'Kiểm tra nội dung và độ dài các trường trước khi lưu.',
    CSRF_REJECTED: 'Hãy tải lại trang để xác nhận yêu cầu.',
    EXERCISE_NOT_ARCHIVED: 'Chỉ có thể xóa bài tập đã gỡ khỏi thư viện.',
    EXERCISE_ARCHIVED: 'Bài tập đã được gỡ công bố.',
    DUPLICATE_REFERENCE: 'Có mã media hoặc biến thể bị lặp.',
  };
  return messages[error.code] ?? (error.status === 503 ? 'Dịch vụ quản trị đang gián đoạn. Hãy thử lại.' : 'Không thể hoàn tất thao tác. Hãy kiểm tra dữ liệu và thử lại.');
}

export async function cms<T>(path: string, { method = 'GET', body, match, key, signal }: {
  method?: string; body?: object; match?: string; key?: string; signal?: AbortSignal;
} = {}): Promise<{ data: T; etag: string | null }> {
  const deadline = AbortSignal.timeout(16000);
  const response = await fetch('/api/v1/admin' + path, {
    method, cache: 'no-store', credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    headers: {
      ...(method !== 'GET' ? { 'X-SmartGym-CSRF': '1' } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(match ? { 'If-Match': match } : {}), ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new CmsError(response.status, data.code);
  return { data, etag: response.headers.get('etag') };
}
