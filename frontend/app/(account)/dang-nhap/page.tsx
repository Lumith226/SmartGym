import Link from 'next/link';
import { AccountForm } from '../../auth/forms';
import { safeReturnPath } from '../../auth/navigation';
import { Button } from '../../../components/ui/button';

export const metadata = { title: 'Đăng nhập — SmartGym' };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const googleClientId = process.env.BFF_GOOGLE_CLIENT_ID;
  const googleSecret =
    process.env.BFF_GOOGLE_CLIENT_SECRET || process.env.BFF_GOOGLE_CLIENT_SECRET_FILE;
  const googleConfigured = Boolean(googleClientId && googleSecret);
  const googleEnabled = process.env.BFF_AUTH_ENABLED === 'true' && googleConfigured;

  const googleMessage =
    query.google === 'email-exists'
      ? 'Email này đã có tài khoản SmartGym. Hãy đăng nhập bằng mật khẩu.'
      : query.google === 'failed'
      ? 'Chưa đăng nhập được bằng Google. Hãy thử lại hoặc dùng mật khẩu.'
      : query.google === 'unavailable'
      ? 'Dịch vụ Google Login đang bảo trì hoặc chưa bật BFF_AUTH_ENABLED.'
      : '';

  const googleLabel = (
    <>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.2 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.91 46.98 24.55Z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.75-2.99-.75-4.59s.27-3.14.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.97-6.19Z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"
        />
      </svg>
      <span>Tiếp tục với Google</span>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Switcher Tab Đăng nhập / Tạo tài khoản */}
      <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/60 p-1">
        <Link
          href="/dang-nhap"
          className="flex items-center justify-center rounded-lg bg-card py-2 text-xs font-semibold text-foreground shadow-xs no-underline"
        >
          Đăng nhập
        </Link>
        <Link
          href="/dang-ky"
          className="flex items-center justify-center rounded-lg py-2 text-xs font-medium text-muted-foreground hover:text-foreground no-underline transition-colors"
        >
          Tạo tài khoản
        </Link>
      </div>

      <div className="space-y-1">
        <h2 className="m-0 text-2xl font-bold tracking-tight text-foreground">
          Đăng nhập SmartGym
        </h2>
        <p className="m-0 text-xs text-muted-foreground">
          Nhập thông tin tài khoản của bạn để vào phòng tập AI.
        </p>
      </div>

      {/* Nút đăng nhập Google */}
      <div>
        <Button
          asChild={googleEnabled}
          type={googleEnabled ? undefined : 'button'}
          disabled={!googleEnabled}
          aria-describedby={googleEnabled ? undefined : 'google-sign-in-status'}
          variant="outline"
          className="h-11 w-full rounded-xl border border-border bg-card text-xs font-semibold text-foreground transition-all hover:bg-accent hover:border-primary/40 cursor-pointer"
        >
          {googleEnabled ? (
            <a
              href="/api/v1/auth/google"
              className="inline-flex items-center justify-center gap-2.5 no-underline"
            >
              {googleLabel}
            </a>
          ) : (
            <span className="inline-flex items-center justify-center gap-2.5 opacity-60 cursor-not-allowed">
              {googleLabel}
            </span>
          )}
        </Button>

        {googleMessage && (
          <p
            role="alert"
            className="mt-2 text-center text-xs font-medium text-destructive"
          >
            {googleMessage}
          </p>
        )}
      </div>

      {/* Đường kẻ phân cách Linear Style */}
      <div className="relative flex items-center py-0.5">
        <div className="flex-grow border-t border-border" />
        <span className="mx-3 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Hoặc dùng Email
        </span>
        <div className="flex-grow border-t border-border" />
      </div>

      <AccountForm kind="login" next={safeReturnPath(query.next)} />

      <p className="m-0 text-center text-xs text-muted-foreground pt-2">
        Chưa kích hoạt tài khoản?{' '}
        <Link
          href="/xac-minh-email"
          className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
        >
          Xác minh email
        </Link>
      </p>
    </div>
  );
}
