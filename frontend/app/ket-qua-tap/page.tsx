import { AuthUnavailable, requireProfile } from '../auth/session';
import { TrainingResults } from './training-results';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kết quả tập — SmartGym',
  robots: { index: false, follow: false },
};

export default async function TrainingResultsPage() {
  const profile = await requireProfile('/ket-qua-tap');
  if (!profile) return <AuthUnavailable retry="/ket-qua-tap" />;
  return <TrainingResults key={profile.id} profileId={profile.id} />;
}
