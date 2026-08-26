'use client';

import { useEffect, useState } from 'react';

/** true เมื่อหน้าเว็บกำลังแสดงผลโหมดมืดจริง ๆ (ไม่ว่าจะมาจาก toggle หรือตามเครื่อง) — ใช้เลือกสีกราฟ (recharts) ที่วาดด้วย SVG attribute ตรง ๆ ไม่ผ่าน CSS variable */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function compute() {
      const explicit = html.getAttribute('data-theme');
      if (explicit === 'dark') return true;
      if (explicit === 'light') return false;
      return media.matches;
    }

    setDark(compute());

    const onMediaChange = () => setDark(compute());
    media.addEventListener('change', onMediaChange);

    const observer = new MutationObserver(() => setDark(compute()));
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      media.removeEventListener('change', onMediaChange);
      observer.disconnect();
    };
  }, []);

  return dark;
}
