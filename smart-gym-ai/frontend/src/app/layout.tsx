import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin", "vietnamese"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Smart Gym AI – Train Smarter. Move Better.",
  description:
    "Hệ thống AI phân tích và đánh giá kỹ thuật tập luyện theo thời gian thực. YOLOv8-Pose + ST-GCN++ + AI Coach cá nhân hóa.",
  keywords: ["fitness AI", "pose analysis", "gym", "workout", "AI coach", "Smart Gym"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
