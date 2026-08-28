import type { MetadataRoute } from 'next';

// เว็บนี้เป็นพอร์ตหุ้นส่วนตัวหลังรหัสผ่าน — บอกบอททุกตัวว่าอย่าเก็บไป index
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
