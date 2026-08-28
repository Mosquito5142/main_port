'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Card, Empty } from '@/components/ui';
import { parseSignalText, maxTranches, type ParsedSignal } from '@/lib/signals';

interface ImportResultRow {
  symbol: string;
  created: number;
  skipped: number;
  error?: string;
}
interface ImportResult {
  created: number;
  skippedDuplicate: number;
  stocksTouched: number;
  perStock: ImportResultRow[];
}

const $ = (n: number) => `$${n.toFixed(n >= 100 ? 1 : 2)}`;

export default function ImportSignalsPage() {
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<ParsedSignal[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tranche, setTranche] = useState<number | 'ALL'>('ALL');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sendingSheet, setSendingSheet] = useState(false);
  const [sheetResult, setSheetResult] = useState<{ sent: number } | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // หมวดหุ้น (จากตาราง stocks จริงใน Turso — "แอดอั้ม" / "จารย์ Shay" ฯลฯ)
  const [categoryEntries, setCategoryEntries] = useState<{ symbol: string; category: string }[]>(
    []
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  useEffect(() => {
    fetch('/api/stocks/categories')
      .then((r) => r.json())
      .then((json) => setCategoryEntries(json.entries ?? []))
      .catch(() => setCategoryEntries([]));
  }, []);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of categoryEntries) m.set(e.symbol, e.category);
    return m;
  }, [categoryEntries]);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of categoryEntries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [categoryEntries]);

  function isInScope(ticker: string): boolean {
    if (selectedCategory === 'ALL') return true;
    return categoryMap.get(ticker.toUpperCase()) === selectedCategory;
  }

  function selectOnlyInScope() {
    setSelectedIds(new Set(items.filter((it) => isInScope(it.ticker)).map((it) => it.id)));
  }

  const tranches = useMemo(() => maxTranches(items), [items]);

  function handleParse() {
    const parsed = parseSignalText(inputText);
    setItems(parsed);
    setSelectedIds(new Set(parsed.map((p) => p.id)));
    setTranche('ALL');
    setResult(null);
    setError(null);
    setSheetResult(null);
    setSheetError(null);
  }

  function clearAll() {
    setInputText('');
    setItems([]);
    setSelectedIds(new Set());
    setTranche('ALL');
    setResult(null);
    setError(null);
    setSheetResult(null);
    setSheetError(null);
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );
  }

  /** ไม้แนวรับที่ "จะถูกนำเข้า" จริง — กรองตาม tranche ที่เลือก (แนวต้านนำเข้าหมดเสมอ ไม่กรอง) */
  function activeSupports(it: ParsedSignal): number[] {
    if (tranche === 'ALL') return it.supports;
    return it.supports[tranche - 1] !== undefined ? [it.supports[tranche - 1]] : [];
  }

  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  async function copySelected() {
    const rows: string[] = [];
    for (const it of selectedItems) {
      for (const p of activeSupports(it)) rows.push(`${it.ticker}\t${p}`);
    }
    if (!rows.length) return;
    await navigator.clipboard.writeText(rows.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveToSystem() {
    if (!selectedItems.length) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        items: selectedItems.map((it) => ({
          symbol: it.ticker,
          datetime: it.datetime,
          supports: activeSupports(it),
          resistances: it.resistances,
        })),
      };
      const res = await fetch('/api/levels/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'บันทึกไม่สำเร็จ');
      setResult(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  /**
   * ส่งเข้า Google Sheet จริง (LineNotify_Watchlist) ผ่าน Apps Script เดิม
   * ส่งเฉพาะ "แนวรับ" เป็นไม้เข้าซื้อ (SMART_ENTRY) — ตามพฤติกรรมเดิมของ portfolio_finance
   * แนวต้านไม่ถูกส่ง เพราะชีตนี้ใช้ยิงแจ้งเตือน LINE ตอนราคาลงมาถึงไม้ซื้อเท่านั้น
   */
  async function sendToSheet() {
    if (!selectedItems.length) return;
    setSendingSheet(true);
    setSheetError(null);
    setSheetResult(null);
    try {
      const sheetItems: {
        ticker: string;
        entry: number;
        cut: number;
        target: number;
        alertType: string;
        triggerPrice: number;
        note: string;
      }[] = [];
      for (const it of selectedItems) {
        activeSupports(it).forEach((price, idx) => {
          sheetItems.push({
            ticker: it.ticker,
            entry: price,
            cut: 0,
            target: 0,
            alertType: 'SMART_ENTRY',
            triggerPrice: price,
            note: `ไม้ ${idx + 1}`,
          });
        });
      }
      if (!sheetItems.length) throw new Error('ไม่มีแนวรับที่จะส่ง (เช็คตัวที่เลือกไว้)');

      const res = await fetch('/api/sheets/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: sheetItems }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'ส่งเข้า Sheet ไม่สำเร็จ');
      setSheetResult({ sent: json.sent });
    } catch (e: any) {
      setSheetError(e.message);
    } finally {
      setSendingSheet(false);
    }
  }

  return (
    <>
      <PageHeader
        title="นำเข้าโพย"
        emoji="📋"
        subtitle="วางข้อความสัญญาณแนวรับ–แนวต้าน แล้วบันทึกเข้าระบบทีเดียวหลายตัว — ขึ้นในหน้าเรดาร์ทันที"
        action={
          <Link href="/levels" className="btn-soft">
            🎯 ไปหน้าเรดาร์ →
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ฝั่งวางข้อความ */}
        <Card title="1. วางข้อความที่นี่" className="flex h-[420px] flex-col lg:h-[640px] lg:col-span-4">
          <textarea
            className="input flex-1 resize-none font-mono text-xs leading-relaxed"
            placeholder={
              'PFE\n25 ส.ค. 23:18\nรับ: $28.4, $26.5, $25.2, $23.7, $20.9\nต้าน: $30.5, $33.7, $37.2\nซ่อน\nเลือก\nNew\n...'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1" onClick={handleParse} disabled={!inputText.trim()}>
              แปลงข้อมูล
            </button>
            <button
              className="btn-danger"
              onClick={clearAll}
              title="ล้างข้อมูล"
              aria-label="ล้างข้อความที่วาง"
            >
              🗑
            </button>
          </div>
        </Card>

        {/* ฝั่งผลลัพธ์ */}
        <Card className="flex h-[420px] flex-col lg:h-[640px] lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-leaf/50 pb-3">
            <div className="flex items-center gap-3">
              {items.length > 0 && (
                <input
                  type="checkbox"
                  checked={selectedIds.size === items.length && items.length > 0}
                  onChange={toggleAll}
                  className="h-5 w-5 accent-[#43A047]"
                />
              )}
              <h2 className="card-title">
                2. ผลลัพธ์ ({selectedIds.size}/{items.length} ตัว)
              </h2>
              {items.length > 0 && selectedCategory !== 'ALL' && (
                <button
                  className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100"
                  onClick={selectOnlyInScope}
                  type="button"
                  title={`ติ๊กเฉพาะหุ้นในหมวด ${selectedCategory}`}
                >
                  ติ๊กเฉพาะหมวดนี้
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {categoryOptions.length > 0 && (
                <select
                  className="select w-auto py-1.5 text-xs"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="ALL">🗂️ ทุกหมวด ({categoryEntries.length} ตัว)</option>
                  {categoryOptions.map((c) => (
                    <option key={c.category} value={c.category}>
                      🎯 {c.category} ({c.count} ตัว)
                    </option>
                  ))}
                </select>
              )}

              {tranches > 0 && (
                <select
                  className="select w-auto py-1.5 text-xs"
                  value={tranche}
                  onChange={(e) => setTranche(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                >
                  <option value="ALL">📦 นำเข้าแนวรับทุกไม้</option>
                  {Array.from({ length: tranches }, (_, i) => (
                    <option key={i} value={i + 1}>
                      🎯 เฉพาะแนวรับไม้ {i + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-auto pr-1">
            {items.length === 0 ? (
              <Empty
                emoji="📋"
                title="ยังไม่มีข้อมูล"
                hint="วางข้อความที่ช่องด้านซ้าย แล้วกด “แปลงข้อมูล”"
              />
            ) : (
              items.map((it) => {
                const selected = selectedIds.has(it.id);
                const active = new Set(activeSupports(it));
                const category = categoryMap.get(it.ticker.toUpperCase());
                const inScope = isInScope(it.ticker);
                return (
                  <div
                    key={it.id}
                    className={[
                      'flex flex-col gap-3 rounded-xl border p-3 transition sm:flex-row sm:items-center',
                      selected ? 'border-leaf/60 bg-surface/70' : 'border-leaf/30 bg-surface/30 opacity-50',
                      selected && !inScope ? 'opacity-70' : '',
                    ].join(' ')}
                  >
                    <div className="flex shrink-0 items-start gap-3 sm:w-32">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(it.id)}
                        className="mt-1 h-5 w-5 accent-[#43A047]"
                      />
                      <div className="min-w-0">
                        <div className="text-lg font-extrabold text-forest">{it.ticker}</div>
                        <div className="text-[11px] text-forest/45">{it.datetime}</div>
                        <div
                          className={[
                            'mt-1 inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            !category
                              ? 'bg-slate-100 text-slate-400'
                              : inScope
                                ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                                : 'bg-slate-100 text-slate-500',
                          ].join(' ')}
                          title={category ?? 'ไม่พบในตาราง stocks'}
                        >
                          {category ?? 'ไม่พบในคลัง'}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 border-t border-leaf/40 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                        แนวรับ
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {it.supports.map((p, i) => (
                          <span
                            key={i}
                            className={
                              active.has(p)
                                ? 'badge bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'badge bg-slate-100 text-slate-400 border border-slate-200'
                            }
                          >
                            ไม้{i + 1}: {$(p)}
                          </span>
                        ))}
                        {it.supports.length === 0 && (
                          <span className="text-xs text-forest/30">—</span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 border-t border-leaf/40 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                        แนวต้าน
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {it.resistances.map((p, i) => (
                          <span
                            key={i}
                            className="badge bg-rose-50 text-rose-700 border border-rose-200"
                          >
                            {$(p)}
                          </span>
                        ))}
                        {it.resistances.length === 0 && (
                          <span className="text-xs text-forest/30">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {items.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-leaf/50 pt-3">
              <button className="btn-soft btn-xs" onClick={copySelected} disabled={!selectedItems.length}>
                {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกที่เลือก'}
              </button>
              <button
                className="btn btn-xs border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                onClick={() => {
                  if (
                    confirm(
                      'ส่งแนวรับที่เลือกเข้า Google Sheet จริง (LineNotify_Watchlist) — จะยิงแจ้งเตือน LINE ด้วย ยืนยันไหม?'
                    )
                  ) {
                    sendToSheet();
                  }
                }}
                disabled={sendingSheet || !selectedItems.length}
                title="ส่งเฉพาะแนวรับ (SMART_ENTRY) เข้าชีตจริง — ตามพฤติกรรมเดิมของระบบเก่า"
              >
                {sendingSheet ? 'กำลังส่ง…' : '📤 ส่งเข้า Sheet จริง'}
              </button>
              <button
                className="btn-primary btn-xs"
                onClick={saveToSystem}
                disabled={saving || !selectedItems.length}
              >
                {saving ? 'กำลังบันทึก…' : `💾 บันทึกเข้าระบบ (${selectedItems.length} ตัว)`}
              </button>
            </div>
          )}
        </Card>
      </div>

      {sheetError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          ส่งเข้า Sheet ไม่สำเร็จ: {sheetError}
        </div>
      )}

      {sheetResult && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          📤 ส่งเข้า Google Sheet จริงแล้ว {sheetResult.sent} รายการ — เช็คแจ้งเตือน LINE / ชีต LineNotify_Watchlist ได้เลย
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="mb-2 font-semibold">
            บันทึกแล้ว 🌿 สร้างแนวใหม่ {result.created} เส้น ({result.stocksTouched} หุ้น)
            {result.skippedDuplicate > 0 && ` · ข้าม ${result.skippedDuplicate} เส้นที่ซ้ำของเดิม`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.perStock.map((r) => (
              <span
                key={r.symbol}
                className={
                  r.error
                    ? 'badge bg-rose-100 text-rose-700'
                    : r.created > 0
                      ? 'badge-green'
                      : 'badge bg-slate-100 text-slate-500'
                }
                title={r.error ?? `ใหม่ ${r.created} · ซ้ำ ${r.skipped}`}
              >
                {r.symbol} {r.error ? '⚠️' : `+${r.created}`}
              </span>
            ))}
          </div>
          <Link href="/levels" className="btn-soft btn-xs mt-3 inline-flex">
            🎯 ไปดูที่หน้าเรดาร์ →
          </Link>
        </div>
      )}
    </>
  );
}
