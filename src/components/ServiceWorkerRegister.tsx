'use client';

import { useEffect } from 'react';

/** ลงทะเบียน service worker ให้แอปใช้แบบออฟไลน์เบื้องต้นได้ + กด "เพิ่มไปหน้าจอโฮม" ได้จริง
 *  ปิดไว้ตอน dev เพราะแคชของ SW จะรบกวนการรีโหลดสด ๆ ระหว่างพัฒนา (Fast Refresh) */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // เงียบไว้พอ — ถ้าลงทะเบียนไม่สำเร็จ แอปยังใช้งานได้ปกติแบบออนไลน์
    });
  }, []);

  return null;
}
