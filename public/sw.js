// Service worker ของ GreenPort — ทำให้เปิดจากมือถือแบบ "เพิ่มไปหน้าจอโฮม" ได้
// และใช้งานพื้นฐานได้ตอนเน็ตหลุด (เห็นหน้าที่เคยเปิด/ข้อมูลล่าสุดที่เคยดึงไว้)
// อัปเดตเลขเวอร์ชันทุกครั้งที่แก้ไฟล์นี้ เพื่อบังคับให้แคชเก่าถูกล้าง
const VERSION = 'gp-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;
const OFFLINE_URL = '/offline.html';

const SHELL_ASSETS = ['/', OFFLINE_URL, '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('gp-') && !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST/PUT/DELETE ปล่อยผ่าน ไม่แคช
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ไม่ยุ่งกับ Yahoo/ภายนอก

  // หน้า HTML (navigation): network-first, ถ้าหลุดใช้แคชล่าสุด, ถ้าไม่มีเลยใช้ offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(
          () =>
            caches.match(request).then((cached) => cached) ||
            caches.match(OFFLINE_URL)
        )
    );
    return;
  }

  // ข้อมูล API: network-first, cache เป็น fallback ตอนออฟไลน์ (เห็นข้อมูลล่าสุดที่เคยดึงได้)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ไฟล์ static (_next/static, รูป, ฟอนต์): cache-first เพราะไม่เปลี่ยนแล้วในแต่ละ build
  if (
    url.pathname.startsWith('/_next/static/') ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
  }
});
