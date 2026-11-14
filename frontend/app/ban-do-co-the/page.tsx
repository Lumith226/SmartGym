import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { catalog, libraryQuery, type CatalogParams } from '../catalog';
import { publicMetadata } from '../catalog-public';
import { MuscleMap, type MuscleGroup } from '../muscle-map';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<CatalogParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = libraryQuery(await searchParams);
  return publicMetadata(
    query.size ? undefined : '/ban-do-co-the',
    'SmartGym — Bản đồ cơ thể tương tác',
    'Chọn nhóm cơ trên bản đồ giải phẫu mặt trước và mặt sau để mở bài tập tương ứng.',
  );
}

export default async function BodyMapPage({ searchParams }: Props) {
  const query = libraryQuery(await searchParams);

  if (query.get('muscleGroupId') || query.get('q')) {
    redirect(`/bai-tap?${query.toString()}`);
  }

  const groupsResponse = await catalog('/api/v1/muscle-groups').catch(() => null);
  const groups: MuscleGroup[] | undefined = groupsResponse?.items;

  if (!groups || !groups.length) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Đang kết nối bản đồ cơ thể
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Bạn có thể tải lại trang sau giây lát.</p>
        <div className="mt-4">
          <Button asChild>
            <a href="/ban-do-co-the">Tải lại</a>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="home -mt-2">
      <MuscleMap groups={groups} query={query.toString()} basePath="/bai-tap" />
    </div>
  );
}

