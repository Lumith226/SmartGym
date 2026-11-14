import { redirect } from 'next/navigation';

export const metadata = { title: 'Phòng tập — SmartGym' };

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ exercise?: string | string[] }> }) {
  const { exercise } = await searchParams;
  redirect(typeof exercise === 'string' ? '/?' + new URLSearchParams({ exercise }) : '/');
}
