import Link from 'next/link';
import { AccountForm } from '../../auth/forms';

export const metadata = { title: 'Tạo tài khoản — SmartGym' };

export default function Register() {
  return (
    <div className="space-y-6">
      {/* Switcher Tab Đăng nhập / Tạo tài khoản */}
      <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/60 p-1">
        <Link
          href="/dang-nhap"
          className="flex items-center justify-center rounded-lg py-2 text-xs font-medium text-muted-foreground hover:text-foreground no-underline transition-colors"
        >
          Đăng nhập
        </Link>
        <Link
          href="/dang-ky"
          className="flex items-center justify-center rounded-lg bg-card py-2 text-xs font-semibold text-foreground shadow-xs no-underline"
        >
          Tạo tài khoản
        </Link>
      </div>

      <div className="space-y-1">
        <h2 className="m-0 text-2xl font-bold tracking-tight text-foreground">
          Đăng ký tài khoản
        </h2>
        <p className="m-0 text-xs text-muted-foreground">
          Bắt đầu lưu lịch tập và theo dõi tiến độ thể hình cùng SmartGym.
        </p>
      </div>

      <AccountForm kind="register" />

      <p className="m-0 text-center text-xs text-muted-foreground pt-2">
        Đã có tài khoản?{' '}
        <Link
          href="/dang-nhap"
          className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
        >
          Đăng nhập ngay
        </Link>
      </p>
    </div>
  );
}
