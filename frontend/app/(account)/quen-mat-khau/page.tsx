import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AccountForm } from '../../auth/forms';

export const metadata = { title: 'Quên mật khẩu — SmartGym' };

export default function Forgot() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-foreground">
          Quên mật khẩu
        </h1>
        <p className="m-0 text-[13px] text-muted-foreground">
          Nhập email đăng ký để nhận liên kết đặt lại mật khẩu.
        </p>
      </div>

      <AccountForm kind="forgot" />

      <div className="pt-1 text-center">
        <Link
          href="/dang-nhap"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground no-underline hover:opacity-75"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Quay lại đăng nhập</span>
        </Link>
      </div>
    </div>
  );
}

