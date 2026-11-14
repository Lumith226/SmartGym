'use client';

export default function ExerciseError({ reset }: { reset: () => void }) {
  return <section><h1>Chưa tải được bài tập</h1><p>Thư viện đang kết nối lại.</p>
    <button type="button" onClick={reset}>Thử tải lại</button><p><a href="/">Trở về thư viện</a></p>
  </section>;
}
