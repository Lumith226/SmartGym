import { notFound } from 'next/navigation';
import { identifier } from '../../cms';
import { EditorWithTaxonomy } from '../../taxonomy';
export default async function EditExercise({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!identifier.test(id)) notFound();
  return <section>{(await searchParams)['da-tao'] === '1' && <p role="status" className="form-success">Đã tạo bản nháp.</p>}
    <EditorWithTaxonomy id={id} />
  </section>;
}
