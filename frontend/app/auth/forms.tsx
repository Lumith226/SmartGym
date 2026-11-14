'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
} from 'lucide-react';
import { safeReturnPath } from './navigation';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { toast } from '../../lib/toast';

const errors: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu chưa đúng.',
  EMAIL_UNVERIFIED: 'Email chưa được xác minh. Hãy kiểm tra hộp thư hoặc yêu cầu gửi lại liên kết.',
  ACTION_EXPIRED: 'Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu liên kết mới.',
  VALIDATION_ERROR: 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các trường đã nhập.',
  RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Hãy đợi 15 phút rồi thử lại.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hiệu lực. Hãy đăng nhập lại.',
  CSRF_REJECTED: 'Không thể xác nhận yêu cầu. Hãy tải lại trang rồi thử lại.',
  AUTH_UNAVAILABLE: 'Dịch vụ tài khoản đang bảo trì trên môi trường local này.',
};

type Result = { ok: boolean; code?: string; data?: unknown };

function useCommand() {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    setReady(true);
    return () => active.current?.abort();
  }, []);

  async function send(path: string, body: Record<string, string>, method = 'POST'): Promise<Result> {
    if (active.current) return { ok: false };
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 12000);
    setPending(true);
    setError('');
    setErrorCode('');
    try {
      const response = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-SmartGym-CSRF': '1' },
        body: JSON.stringify(body),
      });
      const data = response.status === 204 || response.status === 202 ? null : await response.json();
      if (!response.ok) {
        const code = typeof data?.code === 'string' ? data.code : '';
        const msg = errors[code] ?? 'Dịch vụ tài khoản đang gián đoạn. Bạn có thể thử lại sau.';
        setError(msg);
        setErrorCode(code);
        toast.error('Lỗi xác thực', msg);
        return { ok: false, code };
      }
      return { ok: true, data };
    } catch {
      if (!controller.signal.aborted || active.current === controller) {
        const msg = 'Chưa nhận được phản hồi. Hãy kiểm tra kết nối trước khi thử lại.';
        setError(msg);
        toast.error('Lỗi kết nối', msg);
      }
      return { ok: false };
    } finally {
      clearTimeout(timer);
      active.current = null;
      setPending(false);
    }
  }

  return {
    ready,
    pending,
    error,
    errorCode,
    send,
    clearError: () => {
      setError('');
      setErrorCode('');
    },
  };
}

type Field = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  value?: string;
  forgotLink?: boolean;
  description?: string;
};

function Fields({
  fields,
  disabled = false,
}: {
  fields: Field[];
  disabled?: boolean;
}) {
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      {fields.map(field => {
        const isPassword = field.type === 'password';
        const visible = !!showPasswords[field.name];
        const actualType = isPassword ? (visible ? 'text' : 'password') : (field.type ?? 'text');

        return (
          <div key={field.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`field-${field.name}`}
                className="text-[13px] font-semibold text-foreground/90"
              >
                {field.label}
              </label>
            </div>
            <div className="relative flex items-center">
              <Input
                id={`field-${field.name}`}
                name={field.name}
                type={actualType}
                required
                disabled={disabled}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                minLength={field.minLength}
                maxLength={field.maxLength ?? 120}
                defaultValue={field.value}
                aria-describedby={field.description ? `field-${field.name}-help` : field.autoComplete === 'new-password' ? 'password-help' : undefined}
                className={cn(
                  'h-11 rounded-xl border border-border/70 bg-muted/40 px-3.5 text-[14px] text-foreground shadow-xs transition-all placeholder:text-muted-foreground hover:border-border hover:bg-muted/70 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20',
                  isPassword && 'pr-10',
                )}
              />
              {isPassword && (
                <button
                  type="button"
                  onClick={() =>
                    setShowPasswords(prev => ({ ...prev, [field.name]: !prev[field.name] }))
                  }
                  aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-2.5 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            {field.forgotLink && (
              <div className="text-right">
                <Link
                  href="/quen-mat-khau"
                  className="text-[12px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Quên mật khẩu?
                </Link>
              </div>
            )}
            {field.description && (
              <p id={`field-${field.name}-help`} className="text-sm text-ink-soft">{field.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const emailField: Field = {
  name: 'email',
  label: 'Email',
  type: 'email',
  placeholder: 'name@example.com',
  autoComplete: 'email',
  maxLength: 254,
};

const newPassword: Field = {
  name: 'password',
  label: 'Mật khẩu',
  type: 'password',
  placeholder: '••••••••',
  autoComplete: 'new-password',
  minLength: 8,
  maxLength: 128,
};

function PasswordHelp() {
  return <p id="password-help" className="m-0 text-[12px] text-muted-foreground">Tối thiểu 8 ký tự.</p>;
}

export function AccountForm({
  kind,
  next = '/app',
}: {
  kind: 'register' | 'login' | 'forgot' | 'resend';
  next?: string;
}) {
  const command = useCommand();
  const [success, setSuccess] = useState(false);

  const settings = {
    register: {
      endpoint: 'register',
      button: 'Tạo tài khoản',
      fields: [
        {
          name: 'displayName',
          label: 'Họ và tên',
          placeholder: 'Nguyễn Văn A',
          autoComplete: 'name',
          maxLength: 120,
        },
        emailField,
        newPassword,
      ],
    },
    login: {
      endpoint: 'login',
      button: 'Đăng nhập',
      fields: [
        emailField,
        {
          ...newPassword,
          minLength: 1,
          autoComplete: 'current-password',
          forgotLink: true,
        },
      ],
    },
    forgot: {
      endpoint: 'password-reset-requests',
      button: 'Gửi liên kết đặt lại',
      fields: [emailField],
    },
    resend: {
      endpoint: 'verification-requests',
      button: 'Gửi lại email xác minh',
      fields: [emailField],
    },
  }[kind];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const res = await command.send('/api/v1/auth/' + settings.endpoint, body);
    if (res.ok) {
      window.dispatchEvent(new Event('smartgym:auth-changed'));
      if (kind === 'login') {
        toast.success('Đăng nhập thành công!', 'Chào mừng bạn quay lại SmartGym.');
        window.location.replace(safeReturnPath(next));
      } else if (kind === 'register') {
        toast.success('Đăng ký thành công!', 'Tài khoản của bạn đã được khởi tạo.');
        window.location.replace(safeReturnPath(next));
      } else {
        toast.info('Đã gửi yêu cầu', 'Vui lòng kiểm tra hộp thư email của bạn.');
        setSuccess(true);
        form.reset();
      }
    }
  }

  return (
    <div className="space-y-4">
      <form
        method="post"
        className="account-form space-y-4"
        onSubmit={submit}
        aria-busy={command.pending}
      >
        <Fields
          fields={settings.fields}
          disabled={!command.ready}
        />
        {kind === 'register' && <PasswordHelp />}
        <Button
          type="submit"
          disabled={!command.ready || command.pending}
          className="mt-2 h-11 w-full rounded-xl bg-primary text-xs font-semibold text-primary-foreground shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
        >
          {command.pending ? 'Đang xử lý…' : settings.button}
        </Button>
      </form>

      {command.error && (
        <div
          role="alert"
          aria-label="Lỗi biểu mẫu"
          className="form-error flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-1">
            <p className="m-0">{command.error}</p>
            {command.errorCode === 'EMAIL_UNVERIFIED' && (
              <p className="m-0">
                <Link href="/xac-minh-email" className="font-semibold text-red-800 underline">
                  Xác minh hoặc gửi lại email
                </Link>
              </p>
            )}
            {command.errorCode === 'UNAUTHENTICATED' && (
              <p className="m-0">
                <Link href="/dang-nhap" className="font-semibold text-red-800 underline">
                  Đăng nhập lại
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="form-success flex items-start gap-2.5 rounded-md border border-emerald-500/20 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="m-0">
            Nếu địa chỉ hợp lệ, liên kết sẽ được gửi đến hộp thư của bạn. Hãy kiểm tra cả thư mục thư rác.
          </p>
        </div>
      )}
    </div>
  );
}

export function ActionTokenForm({ kind }: { kind: 'verify' | 'reset' }) {
  const command = useCommand();
  const [token, setToken] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mismatch, setMismatch] = useState('');

  useEffect(() => {
    function readActionLink() {
      const url = new URL(window.location.href);
      const value = new URLSearchParams(url.hash.slice(1)).get('token');
      if (value && /^[A-Za-z0-9_-]{43}$/.test(value)) {
        setToken(value);
        setSuccess(false);
        setMismatch('');
        command.clearError();
      }
      url.hash = '';
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
      setLoaded(true);
    }
    readActionLink();
    window.addEventListener('hashchange', readActionLink);
    window.addEventListener('popstate', readActionLink);
    return () => {
      window.removeEventListener('hashchange', readActionLink);
      window.removeEventListener('popstate', readActionLink);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMismatch('');
    const values = new FormData(event.currentTarget);
    const password = String(values.get('newPassword') ?? '');
    if (kind === 'reset' && password !== values.get('confirmPassword')) {
      setMismatch('Hai mật khẩu chưa khớp nhau.');
      return;
    }
    const body: Record<string, string> =
      kind === 'verify' ? { token } : { token, newPassword: password };
    if (
      (await command.send('/api/v1/auth/' + (kind === 'verify' ? 'verify-email' : 'password-reset'), body)).ok
    ) {
      setToken('');
      setSuccess(true);
    }
  }

  if (!loaded) {
    return (
      <p role="status" className="rounded-md bg-muted px-3.5 py-2.5 text-xs font-medium text-muted-foreground">
        Đang đọc liên kết…
      </p>
    );
  }

  if (success) {
    return (
      <div
        role="status"
        className="space-y-3 rounded-md border border-emerald-500/20 bg-emerald-50/80 p-4 text-sm text-emerald-900"
      >
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span>
            {kind === 'verify'
              ? 'Email đã được xác minh.'
              : 'Mật khẩu đã được đặt lại. Các phiên cũ đã kết thúc.'}
          </span>
        </div>
        <Button asChild size="sm" className="rounded-md bg-[#171a20] text-white hover:bg-black">
          <Link href="/dang-nhap" className="no-underline">
            Đăng nhập để tiếp tục
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!token ? (
        <div className="rounded-md bg-muted px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          Chưa có liên kết hợp lệ. Hãy mở liên kết từ email mới nhất hoặc yêu cầu gửi lại bên dưới.
        </div>
      ) : (
        <form
          key={token}
          method="post"
          className="account-form space-y-4"
          onSubmit={submit}
          aria-busy={command.pending}
        >
          {kind === 'reset' && (
            <>
              <Fields
                fields={[
                  { ...newPassword, name: 'newPassword', label: 'Mật khẩu mới' },
                  { ...newPassword, name: 'confirmPassword', label: 'Nhập lại mật khẩu mới' },
                ]}
              />
              <PasswordHelp />
            </>
          )}
          <Button
            type="submit"
            disabled={command.pending}
            className="h-11 w-full rounded-md bg-[#171a20] text-[14px] font-semibold text-white hover:bg-black"
          >
            {command.pending
              ? 'Đang xử lý…'
              : kind === 'verify'
                ? 'Xác nhận địa chỉ email'
                : 'Đặt lại mật khẩu'}
          </Button>
        </form>
      )}

      {(command.error || mismatch) && (
        <div
          role="alert"
          aria-label="Lỗi biểu mẫu"
          className="form-error flex items-start gap-2.5 rounded-md border border-red-500/20 bg-red-50/80 px-3.5 py-2.5 text-xs font-medium text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <span>{mismatch || command.error}</span>
        </div>
      )}

      {kind === 'reset' && (
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/quen-mat-khau" className="font-semibold text-foreground underline-offset-4 hover:underline">
            Yêu cầu liên kết đặt lại mới
          </Link>
        </p>
      )}
    </div>
  );
}

export function ProfileForm({ displayName, timeZone }: { displayName: string; timeZone: string }) {
  const command = useCommand();
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if ((await command.send('/api/v1/me', values, 'PATCH')).ok) {
      setSuccess(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <form
        method="post"
        className="account-form space-y-4"
        onSubmit={submit}
        aria-busy={command.pending}
        onChange={() => {
          setSuccess(false);
          command.clearError();
        }}
      >
        <Fields
          disabled={!command.ready || command.pending}
          fields={[
            { name: 'displayName', label: 'Tên hiển thị', value: displayName, autoComplete: 'name' },
            { name: 'timeZone', label: 'Múi giờ', value: timeZone, maxLength: 80, description: 'Ở Việt Nam, nhập Asia/Ho_Chi_Minh.' },
          ]}
        />
        <Button type="submit" disabled={!command.ready || command.pending} className="w-full sm:w-auto">
          {command.pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
        </Button>
      </form>
      {command.error && (
        <p role="alert" aria-label="Lỗi biểu mẫu" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {command.errorCode === 'VALIDATION_ERROR'
            ? 'Kiểm tra tên hiển thị và múi giờ. Ví dụ: Asia/Ho_Chi_Minh.'
            : command.error}
        </p>
      )}
      <div role="status">
        {success && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> Đã lưu hồ sơ.
          </p>
        )}
      </div>
    </div>
  );
}

export function LogoutButton() {
  const command = useCommand();
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!command.ready || command.pending}
        onClick={async () => {
          if ((await command.send('/api/v1/auth/logout', {})).ok) {
            window.location.replace('/dang-nhap');
          }
        }}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{command.pending ? 'Đang đăng xuất…' : 'Đăng xuất'}</span>
      </Button>
      {command.error && (
        <p role="alert" aria-label="Lỗi biểu mẫu" className="text-xs text-red-600">
          {command.error}
        </p>
      )}
    </div>
  );
}

