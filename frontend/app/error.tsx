'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section><h1>Chưa tải được nội dung</h1><p>Vui lòng thử kết nối lại.</p><button onClick={reset}>Thử lại</button></section>;
}
