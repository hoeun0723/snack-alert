import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "오늘 간식 왔나요? 🍪",
  description: "탕비실 간식 도착을 팀원들과 실시간으로 공유하는 아주 작은 웹사이트",
  applicationName: "간식 도착 알림",
  manifest: "/manifest.json",
  openGraph: {
    title: "오늘 간식 왔나요? 🍪",
    description: "간식이 도착하면 모두에게 바로 알려드려요.",
    type: "website",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-180.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "간식 알림",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#fff7ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
