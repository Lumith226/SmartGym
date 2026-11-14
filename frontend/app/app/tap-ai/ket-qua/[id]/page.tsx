import { notFound } from 'next/navigation';
import { AuthUnavailable, requireProfile } from '../../../../auth/session';
import { ResultView } from '../../training';
import { UUID } from '../../pose-client';

export const metadata = { title: 'Kết quả tập AI — SmartGym' };
export default async function PoseResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const path = '/app/tap-ai/ket-qua/' + id;
  if (!await requireProfile(path)) return <AuthUnavailable retry={path} />;
  return <ResultView key={id} id={id} />;
}
