import { poseCapabilities } from '../../exercise-pose';
import { CmsHeading } from '../cms-design';
import { PoseLinks } from './pose-links';

export const dynamic = 'force-dynamic';

export default async function AdminTrainingRoom() {
  const movements = await poseCapabilities().then(items =>
    items.map(({ id, name, version }) => ({ id, name, version })),
  ).catch(() => null);

  return (
    <section className="w-full space-y-6 pb-8">
      <CmsHeading title="Phòng tập" description="Liên kết các động tác Pose Engine hỗ trợ với bài tập đang công bố trong thư viện." />
      <PoseLinks movements={movements} />
    </section>
  );
}
