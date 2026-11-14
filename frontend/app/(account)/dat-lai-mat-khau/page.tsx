import { ActionTokenForm } from '../../auth/forms';

export const metadata = { title: 'Đặt lại mật khẩu — SmartGym' };

export default function Reset() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-foreground">
          Đặt lại mật khẩu
        </h1>
        <p className="m-0 text-[13px] text-muted-foreground">
          Thiết lập mật khẩu mới cho tài khoản của bạn.
        </p>
      </div>
      <ActionTokenForm kind="reset" />
    </div>
  );
}

