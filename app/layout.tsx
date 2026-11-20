import type { Metadata, Viewport } from "next";

import { siteMetadataBase } from "@/lib/site";

import "./globals.css";

const TITLE = "오늘 간식 왔나요? 🍪";
const DESCRIPTION = "탕비실 간식 도착을 팀원들과 실시간으로 공유하는 아주 작은 웹사이트";
const OG_DESCRIPTION = "간식이 도착하면 모두에게 바로 알려드려요. 링크 하나로 팀 탕비실 상황을 함께 봐요.";
/** 링크 미리보기용 대표 이미지 (1200×630) */
const OG_IMAGE = "/og-image.png";

export const metadata: Metadata = {
  // 링크 미리보기(카톡·Teams 등)는 절대 주소가 필요합니다.
  // 배포 주소는 NEXT_PUBLIC_SITE_URL → Vercel 환경변수 → 요청 호스트 순으로 계산됩니다.
  metadataBase: siteMetadataBase(),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "간식 도착 알림",
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: TITLE,
    title: TITLE,
    description: OG_DESCRIPTION,
    locale: "ko_KR",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "오늘 간식 왔나요? — 탕비실 간식 도착 알림",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: OG_DESCRIPTION,
    images: [OG_IMAGE],
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
