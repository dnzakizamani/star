// Tagihan siswa: daftar invoice miliknya sendiri.
//
// Pembayaran di aplikasi ini simulasi sesuai PRD: siswa tidak bisa membayar
// sendiri, admin yang menandai lunas. Jadi halaman ini hanya untuk melihat.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import type { Invoice } from '@/lib/types';

type BarisInvoice = Invoice & {
  pendaftaran: { kelas: { name: string } | null } | null;
};

export default async function HalamanTagihan() {
  const profil = await wajibPeran('student');
  const supabase = await buatClientServer();

  // RLS membatasi invoice ke milik siswa ini, jadi tidak perlu filter manual.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, pendaftaran:enrollments(kelas:classes(name))')
    .order('created_at', { ascending: false });

  const daftarInvoice = (invoice ?? []) as unknown as BarisInvoice[];

  const totalBelumBayar = daftarInvoice
    .filter((inv) => inv.status === 'unpaid')
    .reduce((jumlah, inv) => jumlah + Number(inv.amount), 0);

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-navy">Tagihan</h1>

      {totalBelumBayar > 0 && (
        <div className="mb-5 rounded-lg border border-gold/50 bg-gold-soft px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-[#8A6D00]">
            Total belum dibayar
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#8A6D00]">
            {formatRupiah(totalBelumBayar)}
          </p>
          <p className="mt-1 text-xs text-[#8A6D00]">
            Hubungi admin untuk konfirmasi pembayaran.
          </p>
        </div>
      )}

      <Kartu judul="Daftar invoice">
        {daftarInvoice.length === 0 ? (
          <p className="text-sm text-cloud-strong">Belum ada tagihan.</p>
        ) : (
          <ul className="divide-y divide-cloud">
            {daftarInvoice.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-navy">
                    {inv.pendaftaran?.kelas?.name ?? 'Kelas'}
                  </p>
                  <p className="text-xs text-cloud-strong">
                    {inv.invoice_number}
                    {' · '}
                    {formatTanggal(inv.created_at)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium text-navy">
                    {formatRupiah(inv.amount)}
                  </p>
                  <div className="mt-1">
                    <BadgeStatus status={inv.status} />
                  </div>
                  {inv.paid_at && (
                    <p className="mt-1 text-xs text-cloud-strong">
                      Dibayar {formatTanggal(inv.paid_at)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Kartu>
    </KerangkaHalaman>
  );
}
