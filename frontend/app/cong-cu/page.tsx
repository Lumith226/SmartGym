import type { Metadata } from 'next';
import { publicMetadata } from '../catalog-public';
import { FitnessTools } from '../../components/fitness-tools';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return publicMetadata(
    '/cong-cu',
    'Công cụ BMI & Calories Macro Tracker — SmartGym',
    'Công cụ tính chỉ số khối cơ thể BMI, lượng calo tiêu hao TDEE/BMR và nhật ký theo dõi Macro dinh dưỡng hàng ngày.',
  );
}

export default function ToolsHubPage() {
  return <FitnessTools />;
}
