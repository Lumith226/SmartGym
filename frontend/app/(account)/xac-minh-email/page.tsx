import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AccountForm, ActionTokenForm } from '../../auth/forms';

export const metadata = { title: 'Xác minh email — SmartGym' };

export default function Verify() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-foreground">
          Xác minh email
        </h1>
        <p className="m-0 text-[13px] text-muted-foreground">
          Xác nhận địa chỉ email để hoàn tất kích hoạt tài khoản.
        </p>
      </div>

      <ActionTokenForm kind="verify" />

      <div className="relative flex items-center py-0.5">
        <div className="flex-grow border-t border-foreground/[0.08]" />
        <span className="mx-3 shrink-0 text-[11px] font-medium uppercase tracking-wider text-[#8e8e93]">
          Gửi lại liên kết
        </span>
        <div className="flex-grow border-t border-foreground/[0.08]" />
      </div>

      <AccountForm kind="resend" />

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

