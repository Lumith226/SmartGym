import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError, profileForSession } from '../../server/identity-client.mjs';
import { safeReturnPath } from './navigation';

export interface Profile {
  id: string; email: string; displayName: string; emailVerified: boolean;
  roles: string[]; timeZone: string; createdAt: string;
}
export async function requireProfile(destination: string): Promise<Profile | null> {
  try {
    return await profileForSession((await headers()).get('cookie') ?? '') as Profile;
  } catch (error) {
    console.error('[requireProfile error]:', error);
    if (error instanceof AuthError && error.status === 401) {
      redirect('/dang-nhap?next=' + encodeURIComponent(safeReturnPath(destination)));
    }
    return null;
  }
}
export function AuthUnavailable({ retry }: { retry: string }) {
  return <section className="auth-card"><h1>Kết nối tài khoản đang gián đoạn</h1>
    <p>Chưa kiểm tra được phiên đăng nhập. Hãy thử lại sau ít phút.</p>
    <p><a href={retry}>Thử lại</a> · <a href="/">Về thư viện bài tập</a></p></section>;
}
