// Daftar logbook yang masuk dari semua kelas.
//
// Halaman ini pusat kerja admin untuk logbook: review isi, setujui, atau
// kembalikan dengan catatan. Persetujuan di sini yang memicu pencatatan
// pendapatan tutor di database.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah, formatJamPelajaran, namaBulan } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
import { setujuiLogbook, kembalikanLogbook } from '../aksi';
import type { RingkasanLogbook } from '@/lib/types';
import Link from 'next/link';

export default async function HalamanLogbookAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  let query = supabase
    .from('v_logbook_summary')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  if (status === 'submitted') {
    query = query.eq('status', 'submitted');
  } else if (status === 'approved') {
    query = query.eq('status', 'approved');
  }

  const { data: logbook } = await query;
  const daftarLogbook = (logbook ?? []) as RingkasanLogbook[];

  // Catatan admin untuk logbook yang dikembalikan.
  const { data: detailCatatan } = await supabase
    .from('logbooks')
    .select('id, admin_note')
    .not('admin_note', 'is', null);

  const catatanPerId = new Map(
    (detailCatatan ?? []).map((l) => [l.id, l.admin_note])
  );

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-ink">Logbook</h1>

      <div className="mb-4 flex gap-1">
        <FilterLink href="/admin/logbook" aktif={!status} label="Semua" />
        <FilterLink
          href="/admin/logbook?status=submitted"
          aktif={status === 'submitted'}
          label="Perlu review"
        />
        <FilterLink
          href="/admin/logbook?status=approved"
          aktif={status === 'approved'}
          label="Disetujui"
        />
      </div>

      {daftarLogbook.length === 0 ? (
        <Kartu>
          <p className="text-sm text-muted">Tidak ada logbook pada filter ini.</p>
        </Kartu>
      ) : (
        <div className="grid gap-4">
          {daftarLogbook.map((lb) => (
            <Kartu key={lb.logbook_id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/kelas/${lb.class_id}/logbook`}
                      className="font-medium text-ink hover:text-accent hover:underline"
                    >
                      {lb.class_name}
                    </Link>
                    <BadgeStatus status={lb.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {namaBulan(lb.period_month)} {lb.period_year}
                    {' · '}
                    {lb.entry_count} entri
                    {' · '}
                    {formatJamPelajaran(lb.total_hours)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-muted">Pendapatan tutor</p>
                  <p className="text-sm font-semibold text-ink">
                    {formatRupiah(lb.projected_payout)}
                  </p>
                  {lb.status === 'approved' && (
                    <p className="mt-0.5 text-xs text-ok">Sudah tercatat</p>
                  )}
                </div>
              </div>

              {catatanPerId.get(lb.logbook_id) && (
                <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Catatan untuk tutor: {catatanPerId.get(lb.logbook_id)}
                </p>
              )}

              {lb.status === 'submitted' && (
                <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-ink">Setujui</p>
                    <p className="mb-2 text-xs text-muted">
                      Pendapatan tutor akan tercatat otomatis dan logbook menjadi
                      tidak bisa diubah.
                    </p>
                    <FormAksi action={setujuiLogbook} labelTombol="Setujui logbook">
                      <input type="hidden" name="logbook_id" value={lb.logbook_id} />
                    </FormAksi>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-ink">
                      Kembalikan untuk perbaikan
                    </p>
                    <FormAksi
                      action={kembalikanLogbook}
                      labelTombol="Kembalikan"
                      varianTombol="bahaya"
                    >
                      <input type="hidden" name="logbook_id" value={lb.logbook_id} />
                      <div>
                        <label
                          htmlFor={`catatan-${lb.logbook_id}`}
                          className="mb-1 block text-sm font-medium text-ink"
                        >
                          Catatan untuk tutor
                        </label>
                        <textarea
                          id={`catatan-${lb.logbook_id}`}
                          name="catatan"
                          rows={2}
                          required
                          placeholder="Contoh: observasi les kedua terlalu singkat."
                          className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                        />
                      </div>
                    </FormAksi>
                  </div>
                </div>
              )}
            </Kartu>
          ))}
        </div>
      )}
    </KerangkaHalaman>
  );
}

function FilterLink({
  href,
  aktif,
  label,
}: {
  href: string;
  aktif: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded border px-3 py-1 text-sm ${
        aktif
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );
}
