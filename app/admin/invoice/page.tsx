// Daftar semua invoice. Admin bisa menandai lunas dari sini.
//
// Filter status lewat query string (?status=unpaid), bukan state di browser.
// Jadi URL bisa di-bookmark dan tetap benar setelah refresh.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah, formatTanggal } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
import { tandaiInvoiceLunas } from '../aksi';
import type { Invoice } from '@/lib/types';
import Link from 'next/link';

type BarisInvoice = Invoice & {
  pendaftaran: {
    class_id: string;
    siswa: { full_name: string } | null;
    kelas: { name: string } | null;
  } | null;
};

const PILIHAN_FILTER = [
  { nilai: '', label: 'Semua' },
  { nilai: 'unpaid', label: 'Belum dibayar' },
  { nilai: 'paid', label: 'Lunas' },
];

export default async function HalamanInvoice({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  let query = supabase
    .from('invoices')
    .select(
      '*, pendaftaran:enrollments(class_id, siswa:profiles!enrollments_student_id_fkey(full_name), kelas:classes(name))'
    )
    .order('created_at', { ascending: false });

  // Terapkan filter hanya kalau nilainya dikenal.
  if (status === 'unpaid' || status === 'paid') {
    query = query.eq('status', status);
  }

  const { data: invoice } = await query;
  const daftarInvoice = (invoice ?? []) as unknown as BarisInvoice[];

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-navy">Invoice</h1>

      <div className="mb-4 flex gap-1">
        {PILIHAN_FILTER.map((pilihan) => {
          const aktif = (status ?? '') === pilihan.nilai;
          const href = pilihan.nilai ? `/admin/invoice?status=${pilihan.nilai}` : '/admin/invoice';

          return (
            <Link
              key={pilihan.nilai}
              href={href}
              className={`rounded border px-3 py-1 text-sm ${
                aktif
                  ? 'border-gold bg-gold-soft text-gold'
                  : 'border-cloud bg-surface text-cloud-strong hover:text-navy'
              }`}
            >
              {pilihan.label}
            </Link>
          );
        })}
      </div>

      <Kartu
        judul="Daftar invoice"
        keterangan={`${daftarInvoice.length} invoice`}
      >
        {daftarInvoice.length === 0 ? (
          <p className="text-sm text-cloud-strong">Tidak ada invoice pada filter ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cloud text-left text-xs uppercase tracking-wide text-cloud-strong">
                  <th className="pb-2 pr-4 font-medium">Nomor</th>
                  <th className="pb-2 pr-4 font-medium">Siswa</th>
                  <th className="pb-2 pr-4 font-medium">Kelas</th>
                  <th className="pb-2 pr-4 font-medium">Nominal</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {daftarInvoice.map((inv) => (
                  <tr key={inv.id} className="border-b border-cloud last:border-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-navy">{inv.invoice_number}</div>
                      <div className="text-xs text-cloud-strong">
                        {formatTanggal(inv.created_at)}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-cloud-strong">
                      {inv.pendaftaran?.siswa?.full_name ?? '-'}
                    </td>
                    <td className="py-2 pr-4 text-cloud-strong">
                      {inv.pendaftaran?.kelas?.name ?? '-'}
                    </td>
                    <td className="py-2 pr-4 text-navy">
                      {formatRupiah(inv.amount)}
                    </td>
                    <td className="py-2 pr-4">
                      <BadgeStatus status={inv.status} />
                      {inv.paid_at && (
                        <div className="mt-1 text-xs text-cloud-strong">
                          {formatTanggal(inv.paid_at)}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      {inv.status === 'unpaid' ? (
                        <FormAksi
                          action={tandaiInvoiceLunas}
                          labelTombol="Tandai lunas"
                          varianTombol="sekunder"
                        >
                          <input type="hidden" name="invoice_id" value={inv.id} />
                        </FormAksi>
                      ) : (
                        <span className="text-xs text-cloud-strong">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>
    </KerangkaHalaman>
  );
}
