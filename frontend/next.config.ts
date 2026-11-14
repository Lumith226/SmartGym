import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }, ...['/dang-ky', '/dang-nhap', '/xac-minh-email', '/quen-mat-khau', '/dat-lai-mat-khau', '/app/:path*', '/admin/:path*'].map(source => ({
      source, headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    })), { source: '/app/tap-ai/:path*', headers: [{ key: 'Permissions-Policy', value: 'camera=(self), microphone=()' }] }];
  },
};
export default config;
