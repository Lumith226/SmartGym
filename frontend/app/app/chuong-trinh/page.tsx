import { redirect } from 'next/navigation';

export const metadata = { title: 'Kế hoạch tập luyện — SmartGym' };

export default function PlansPage() {
  redirect('/ke-hoach-tap');
}
