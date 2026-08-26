# 🍃 GreenPort — เว็บจัดการพอร์ตหุ้น

Next.js 15 (App Router) + **Turso (libSQL)** · ธีม **greengradientnaturefood**
`#E8F5E9` · `#A5D6A7` · `#66BB6A` · `#1B5E20`

> ไม่ใช้ Docker/Postgres แล้ว — ฐานข้อมูลเป็น Turso ตัวเดียว deploy ขึ้น Vercel ได้เลย

---

## ฟีเจอร์

| ฟีเจอร์ | หน้า | รายละเอียด |
| --- | --- | --- |
| จัดสัดส่วนเป้าหมาย **รายหมวด** | `/portfolios/[id]` | ตั้ง % ต่อหมวด (เช่น Physical AI 18.75% = AMBA/AMBQ/OSS/VPG/OUST) เก็บใน DB แก้ได้ทุกเมื่อ · บอกว่าต้องเติม/ลดกี่บาทเพื่อเข้าเป้า |
| แนวรับ–แนวต้าน + เช็คตัวที่ใกล้จุดที่รอที่สุด | `/levels` | ราคาสดจาก Yahoo เรียงตามระยะห่าง สถานะ ถึงแล้ว/ใกล้มาก/เฝ้าดู/ยังไกล |
| กรอกซื้อขาย + คำนวณค่าเฉลี่ยและสัดส่วน | `/trades`, `/calculator` | เห็นทันทีว่าต้นทุนเฉลี่ยใหม่เท่าไหร่ + ตารางสถานการณ์ + คำนวณย้อนกลับ |
| ดูกราฟหุ้นแต่ละตัว | `/stocks/[symbol]` | กราฟ 5 วัน–5 ปี พร้อมเส้นแนวรับ/แนวต้าน/ต้นทุนเฉลี่ย |
| กราฟการเคลื่อนไหวของพอร์ต | `/`, `/portfolios/[id]` | มูลค่าพอร์ตย้อนหลัง ปักหมุดจุดสูงสุด/ต่ำสุด + max drawdown + วันที่ขึ้น/ลงแรงสุด |
| พอร์ตจำลองไว้เทียบแผน | `/compare` | เอาเงินก้อนเดียวกันไปซื้ออีกแผน ดู equity curve ซ้อนกัน |
| สลับดูเป็นเงินบาท | ทุกหน้า | ปุ่มที่แถบเมนู แปลงด้วยเรตสดจาก Yahoo |

---

## เริ่มใช้งาน

```bash
npm install
```

สร้างไฟล์ `.env.local` (ดูตัวอย่างใน `.env.example`):

```bash
tursourl=libsql://your-db.turso.io
tursoToken=your-token
SITE_PASSWORD=รหัสผ่านที่จะตั้ง
AUTH_SECRET=สุ่มสตริงยาว ๆ ไว้เซ็นคุกกี้ล็อกอิน
```

```bash
npm run dev
```

เปิด http://localhost:3000 — ตารางของแอปถูกสร้างอัตโนมัติตอนรันครั้งแรก · จะเจอหน้าล็อกอินก่อนเข้าใช้งาน (ดูหัวข้อ "Password gate" ด้านล่าง)

### Deploy ขึ้น Vercel

push ขึ้น GitHub แล้ว import ใน Vercel · ตั้ง Environment Variables 2 ตัว (`tursourl`, `tursoToken`) เท่านั้น ไม่ต้องตั้งอะไรเพิ่ม

`vercel.json` ตั้ง region เป็น `hnd1` (โตเกียว) ไว้ให้แล้ว เพราะ Turso database อยู่โตเกียวเหมือนกัน — ถ้าตั้ง region ไกลจากนี้ (เช่น default US East) หน้าเว็บจะช้าลงจากที่ควรเป็น ไม่ใช่เร็วขึ้น

**ข้อควรรู้ (Vercel Hobby/free plan):** function อาจถูกปิดพักเมื่อไม่มีคนใช้แล้วเปิดใหม่ (cold start) — ตอนนั้นแคชราคาในหน่วยความจำจะว่างเปล่าเหมือนตอนรีสตาร์ท (แต่ยังมี `gp_price_cache` ใน DB ช่วยอุ่นให้เร็วกว่าดึงจาก Yahoo ใหม่หมด) แอปพอร์ตส่วนตัวที่ traffic น้อยจะเจอ cold start บ่อยกว่าแอปที่มีคนเข้าตลอด

**อย่าลืมตั้ง `SITE_PASSWORD` และ `AUTH_SECRET` เป็น Environment Variables บน Vercel ด้วย** (เหมือน `tursourl`/`tursoToken`) ไม่งั้นเว็บจะล็อกอินไม่ได้เลยเวลา deploy จริง

---

## 🔒 ความปลอดภัย

### Password gate

ทั้งเว็บถูกล็อกด้วยรหัสผ่านเดียว (`SITE_PASSWORD` ใน `.env.local`) ผ่าน `src/middleware.ts` — ทุกหน้า/ทุก API ต้องล็อกอินก่อนถึงจะเข้าได้ (ยกเว้นหน้า `/login` เองกับไฟล์ PWA)

- เข้าที่ `/login` กรอกรหัสผ่าน → ได้คุกกี้ `gp_session` (httpOnly เซ็นด้วย `AUTH_SECRET`) อยู่ได้ 30 วัน
- เปลี่ยนรหัสผ่าน: แก้ `SITE_PASSWORD` ใน `.env.local` แล้วรีสตาร์ท dev server / redeploy — เซสชันเดิมที่ล็อกอินค้างไว้ยังใช้ได้จนกว่าจะหมดอายุหรือกดออกจากระบบ
- **บังคับให้ทุกคนล็อกอินใหม่ทันที:** เปลี่ยน `AUTH_SECRET` เป็นค่าใหม่ (คุกกี้เก่าทั้งหมดจะตรวจไม่ผ่านทันที)
- ปุ่ม 🚪 ที่แถบเมนู (ข้าง ๆ ปุ่มสลับธีม) = ออกจากระบบ
- ถ้าลืมตั้ง `SITE_PASSWORD`/`AUTH_SECRET` เว็บจะล็อกทุกหน้าไว้ (fail closed) ไม่ปล่อยให้เข้าได้เฉย ๆ

### หมุน Turso token

ถ้า token เคยหลุดไปที่ไหน (เช่นแปะในแชท) ควรสร้างใหม่แล้วเพิกถอนตัวเก่า:

```bash
# ต้องมี turso CLI และล็อกอินก่อน (turso auth login) — CLI ไม่รองรับ Windows โดยตรง ใช้ WSL/macOS/Linux
turso db tokens create portfolio          # ได้ token ใหม่
# เอา token ใหม่ไปแทนที่ tursoToken ใน .env.local และใน Environment Variables บน Vercel
# รีสตาร์ท/redeploy แอปให้ใช้ token ใหม่ ทดสอบว่าเข้าเว็บได้ปกติก่อน
turso db tokens list portfolio            # ดู token/ผู้ออกทั้งหมด
turso db tokens invalidate portfolio      # เพิกถอน token เดิมทั้งหมด (ทำหลังยืนยันว่า token ใหม่ใช้ได้แล้วเท่านั้น)
```

### Backup อัตโนมัติรายวัน

`scripts/backup-daily.mjs` ดึงตาราง `trades`/`stocks`/`sync_log` (ข้อมูลจริง) จาก Turso มาเก็บเป็นไฟล์ SQLite แยกตามวันที่ที่ `backups/portfolio-YYYY-MM-DD.db` เก็บย้อนหลัง 30 วัน (ไฟล์เก่ากว่านั้นลบทิ้งอัตโนมัติ) log การรันแต่ละครั้งไว้ที่ `backups/backup.log`

ตั้งให้รันเองทุกวัน 03:00 น. ผ่าน Windows Task Scheduler (ชื่อ task: **GreenPort Daily Backup**) — เช็ก/แก้ไขได้ที่ Task Scheduler (`taskschd.msc`) หรือคำสั่ง:

```powershell
Get-ScheduledTaskInfo -TaskName "GreenPort Daily Backup"   # ดูว่ารันล่าสุดเมื่อไหร่ สำเร็จมั้ย
Start-ScheduledTask -TaskName "GreenPort Daily Backup"     # สั่งรันทันที (ทดสอบ)
```

ถ้าย้ายเครื่อง/ลง Windows ใหม่ ต้องตั้ง task นี้ใหม่เอง (ผูกกับเครื่องนี้เครื่องเดียว ไม่ได้ตั้งบน Vercel):

```powershell
$action = New-ScheduledTaskAction -Execute "node" -Argument "`"<full-path>\scripts\backup-daily.mjs`"" -WorkingDirectory "<full-path-to-project>"
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
Register-ScheduledTask -TaskName "GreenPort Daily Backup" -Action $action -Trigger $trigger -Description "สำรองข้อมูลเทรดจริงจาก Turso ทุกวัน"
```

สำรองเองแบบ manual (ไฟล์เดียว ไม่ลบของเก่า): `node scripts/backup-turso.mjs data/portfolio.db`

---

## ฐานข้อมูล

ใช้ Turso ตัวเดียวร่วมกับข้อมูลเดิมของคุณ แยกกันด้วยชื่อตาราง:

| ตาราง | เจ้าของ | ใช้ทำอะไร |
| --- | --- | --- |
| `trades`, `stocks`, `sync_log` | **ของคุณ** (sync จาก Google Sheet) | ข้อมูลซื้อขายตัวจริง — แอป**อ่านอย่างเดียว ไม่เขียนทับ** |
| `gp_portfolios`, `gp_stocks`, `gp_trades`, `gp_levels`, `gp_price_cache` | GreenPort | ข้อมูลของแอปเอง |
| `gp_target_groups`, `gp_group_symbols` | GreenPort | สัดส่วนเป้าหมายรายหมวด |

### สัดส่วนเป้าหมายรายหมวด

แก้ที่หน้า **รายละเอียดพอร์ต** (หรือ `PUT /api/target-groups`) — ไม่ต้องแก้โค้ดแล้ว

- **เป้าหมายรายตัว = เป้าของหมวด ÷ จำนวนหุ้นในหมวด** เช่น Physical AI 18.75% มี 5 ตัว → ตัวละ 3.75%
- หมวดที่มีหุ้นตัวเดียว (META, RKLB, ASTS…) ก็คือเป้าหมายรายตัวนั่นเอง
- หุ้นที่ไม่อยู่ในหมวดไหน **+ เงินสด** จะถูกนับรวมที่หมวด `อื่นๆ / เงินสด` อัตโนมัติ
- สัดส่วนจริงคิดจาก **มูลค่าหุ้น + เงินสด** เพื่อให้เงินสดถูกนับเป็นส่วนหนึ่งของพอร์ตตามชื่อหมวด
- ระบบกันไม่ให้: หุ้นตัวเดียวอยู่ 2 หมวด · รวมเกิน 100% · ตั้งเป้าแต่ไม่ใส่หุ้น
- ครั้งแรกที่เปิดจะใส่ค่าเริ่มต้นตามแผน "Growth Portfolio ตามสัดส่วนความมั่นใจ" ให้อัตโนมัติ (รวม 100%)
- `target_alloc` ในชีตเป็นฟิลด์ legacy **ไม่ถูก sync เข้ามาแล้ว** — ของจริงอยู่ที่หมวด

### ดึงข้อมูลจากชีตเข้าแอป

กดปุ่ม **"🔄 ดึงข้อมูลล่าสุดจากชีต"** ที่หน้าภาพรวม (หรือ `POST /api/sync`)

การแปลงข้อมูล:

| ใน `trades` ของคุณ | เข้าไปเป็น |
| --- | --- |
| 1 แถว | รายการ **ซื้อ** 1 รายการ |
| `sold_date` / `sold_qty` / `sold_price` | รายการ **ขาย** ที่ผูกกัน |
| `cut_loss` | แนวรับ (เฉพาะไม้ที่ยังไม่ปิด) |
| `target` | แนวต้าน (เฉพาะไม้ที่ยังไม่ปิด) |
| `group_key` | sector ของหุ้น |
| `stocks.detail` / `stocks.category` | ชื่อบริษัท / โน้ต |
| `ticker = CASH` | ข้าม |

- sync ซ้ำได้ไม่จำกัด (idempotent) — **ข้อมูลที่คุณกรอกเองในเว็บจะไม่ถูกลบ** เพราะแยกด้วยคอลัมน์ `source` (`turso` vs `manual`)
- เงินตั้งต้นคำนวณอัตโนมัติ = เงินสูงสุดที่เคยลงพร้อมกัน

### สำรองข้อมูลลงเครื่อง

ดูหัวข้อ **"Backup อัตโนมัติรายวัน"** ด้านล่าง (มีทั้งแบบอัตโนมัติทุกวันและสั่งเองได้)

---

## สลับดูเป็นเงินบาท

ปุ่มอยู่ที่แถบเมนูซ้าย (**ตามจริง** / **฿ บาท**) จำค่าไว้ใน cookie `gp_ccy`

- อัตราแลกเปลี่ยนดึงสดจาก Yahoo (`USDTHB=X`) แคช 10 นาที และมีบอกเรตที่ใช้ไว้ใต้หัวข้อหน้า
- ถ้าดึงเรตไม่ได้ ระบบจะ **แสดงเป็นสกุลเดิม** พร้อมบอกเหตุผล (ไม่เดาตัวเลข)
- เปอร์เซ็นต์ทั้งหมด (ผลตอบแทน สัดส่วน) ไม่เปลี่ยนตามสกุลเงิน เพราะเป็นอัตราส่วน

**หน้าที่แปลง:** ภาพรวม · พอร์ตของฉัน · รายละเอียดพอร์ต
**หน้าที่ยังเป็นสกุลจริงเสมอ:** บันทึกซื้อขาย · คำนวณถัวเฉลี่ย · แนวรับ–แนวต้าน · รายละเอียดหุ้น
(เพราะเป็นหน้าที่ต้องกรอกราคา หรือเป็นราคาต่อหุ้นที่ต้องเทียบกับราคาตลาดจริง — มีแถบเตือนบอกไว้บนหน้า)

### ล้างข้อมูลของแอป / เริ่มใหม่

ลบเฉพาะตารางของ GreenPort (ข้อมูล `trades`/`stocks` ตัวจริงของคุณไม่ถูกแตะ):

```bash
turso db shell portfolio "DROP TABLE IF EXISTS gp_trades; DROP TABLE IF EXISTS gp_targets; DROP TABLE IF EXISTS gp_levels; DROP TABLE IF EXISTS gp_stocks; DROP TABLE IF EXISTS gp_portfolios; DROP TABLE IF EXISTS gp_price_cache;"
```

แล้วเปิดเว็บใหม่ ตารางจะถูกสร้างให้อัตโนมัติ จากนั้นกดปุ่มดึงข้อมูลจากชีตอีกครั้ง
#   m a i n _ p o r t  
 