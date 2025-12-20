import type { Metadata } from "next";
import { Toaster } from 'sonner';
import "./globals.css";

export const metadata: Metadata = {
  title: "Classzle - 완벽한 반 편성을 위한 마지막 조각",
  description: "복잡한 반 편성, 퍼즐처럼 딱 맞게. 선생님을 위한 스마트 반편성 솔루션 클래즐.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
