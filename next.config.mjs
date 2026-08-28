/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ซ่อน header X-Powered-By: Next.js (ไม่ต้องบอกโลกว่าเว็บรันด้วยอะไร)
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // กันเว็บอื่นเอาเว็บเราไปฝังใน iframe แล้วหลอกให้กดปุ่ม (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // กันเบราว์เซอร์เดาชนิดไฟล์เอง (MIME sniffing)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // ไม่ส่ง URL เต็มของเราไปให้เว็บปลายทางตอนคลิกลิงก์ออก
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // ปิดสิทธิ์ที่แอปไม่ได้ใช้ ไม่ให้สคริปต์ไหนขอได้เลย
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // เว็บนี้เป็นพอร์ตส่วนตัว ไม่ควรถูก Google/บอทเก็บไปทำ index
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
