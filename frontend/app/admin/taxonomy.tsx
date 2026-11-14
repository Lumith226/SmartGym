import Link from 'next/link';
import { catalog } from '../catalog';
import { ExerciseEditor, type Taxonomy } from './editor';

export async function EditorWithTaxonomy({ id }: { id?: string }) {
  let taxonomy: Taxonomy;
  try {
    const [groups, equipment] = await Promise.all([catalog('/api/v1/muscle-groups'), catalog('/api/v1/equipment')]);
    taxonomy = { groups: groups.items, equipment: equipment.items };
  } catch {
    return <section><h1>Chưa tải được nhóm cơ và dụng cụ</h1>
      <p><a href={id ? '/admin/bai-tap/' + id : '/admin/bai-tap/moi'}>Thử lại</a> · <Link href="/admin/bai-tap">Về danh sách</Link></p>
    </section>;
  }
  return <ExerciseEditor id={id} taxonomy={taxonomy} />;
}
