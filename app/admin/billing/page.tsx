// Panel kesehatan billing untuk admin.
//
// PRD menyebut keluhan utama admin: "tidak bisa tahu" sisa jam siswa, invoice
// belum dibayar, dan profitabilitas kelas. Halaman ini menjawab ketiganya
// dalam satu layar, dari view yang sudah ada (v_enrollment_balance,
// v_class_finance) tanpa logika baru.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah, formatJamPelajaran } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import Link from 'next/link';

// Ambang batas yang menampilkan sesuatu di panel. Dipisah sebagai konstanta
// supaya mudah dijelaskan dan diubah.
const JAM_MENIPIS = 3;
const INVOICE_TUA_HARI = 7;

// Batas "invoice tua": created_at lebih tua dari tanggal ini.
function batasTanggalTua(): string {
  const d = new Date();
  d.setDate(d.getDate() - INVOICE_TUA_HARI);
  return d.toISOString();
}

export default async function HalamanBilling() {
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  // Siswa dengan sisa jam menipis (tapi masih aktif).
  const { data: saldo } = await supabase
    .from('v_enrollment_balance')
    .select('enrollment_id, student_id, class_id, package_hours, hours_remaining, enrollment_status')
    .eq('enrollment_status', 'active')
    .lt('hours_remaining', JAM_MENIPIS)
    .order('hours_remaining');

  const saldoMenipis = (saldo ?? []) as {
    enrollment_id: string;
    student_id: string;
    class_id: string;
    hours_remaining: number;
    package_hours: number;
  }[];

  // Nama siswa dan kelas untuk baris-baris di atas.
  const idsSiswa = [...new Set(saldoMenipis.map((s) => s.student_id))];
  const idsKelas = [...new Set(saldoMenipis.map((s) => s.class_id))];

  const { data: namaSiswa } = idsSiswa.length
    ? await supabase.from('profiles').select('id, full_name').in('id', idsSiswa)
    : { data: [] };
  const { data: namaKelas } = idsKelas.length
    ? await supabase.from('classes').select('id, name').in('id', idsKelas)
    : { data: [] };

  const namaSiswaPerId = new Map((namaSiswa ?? []).map((s) => [s.id, s.full_name]));
  const namaKelasPerId = new Map((namaKelas ?? []).map((s) => [s.id, s.name]));

  // Invoice belum dibayar, yang tertua dulu. Yang lebih tua dari ambang batas
  // ditandai di UI.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount, status, created_at, pendaftaran:enrollments(kelas:classes(name), siswa:profiles(full_name))')
    .eq('status', 'unpaid')
    .order('created_at');

  const daftarInvoice = (invoice ?? []) as unknown as {
    id: string;
    invoice_number: string;
    amount: number;
    created_at: string;
    pendaftaran: {
      kelas: { name: string } | null;
      siswa: { full_name: string } | null;
    } | null;
  }[];

  const batasTua = batasTanggalTua();
  const invoiceTua = daftarInvoice.filter((i) => i.created_at < batasTua);
  const totalUnpaid = daftarInvoice.reduce((j, i) => j + Number(i.amount), 0);

  // Margin per kelas dari view yang menghitung revenue dan cost.
  const { data: keuangan } = await supabase
    .from('v_class_finance')
    .select('*')
    .order('margin');

  const barisKeuangan = (keuangan ?? []) as unknown as {
    class_id: string;
    class_name: string;
    revenue_paid: number;
    tutor_cost_approved: number;
    margin: number;
  }[];

  const totalRevenue = barisKeuangan.reduce((j, b) => j + Number(b.revenue_paid), 0);
  const totalCost = barisKeuangan.reduce((j, b) => j + Number(b.tutor_cost_approved), 0);

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-navy">Kesehatan Billing</h1>

      {/* Angka besar yang menjawab tiga keluhan PRD dalam sekali lhat. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-cloud bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-cloud-strong">
            Invoice belum dibayar
          </p>
          <p className="mt-1 text-2xl font-semibold text-navy">{daftarInvoice.length}</p>
          <p className="text-xs text-cloud-strong">{formatRupiah(totalUnpaid)}</p>
        </div>

        <div className={`rounded-lg border px-5 py-4 ${invoiceTua.length > 0 ? 'border-gold/60 bg-gold-soft' : 'border-cloud bg-surface'}`}>
          <p className="text-xs uppercase tracking-wide text-cloud-strong">
            Belum dibayar &gt; {INVOICE_TUA_HARI} hari
          </p>
          <p className={`mt-1 text-2xl font-semibold ${invoiceTua.length > 0 ? 'text-[#8A6D00]' : 'text-navy'}`}>
            {invoiceTua.length}
          </p>
          <p className="text-xs text-cloud-strong">perlu ditindaklanjuti</p>
        </div>

        <div className={`rounded-lg border px-5 py-4 ${saldoMenipis.length > 0 ? 'border-gold/60 bg-gold-soft' : 'border-cloud bg-surface'}`}>
          <p className="text-xs uppercase tracking-wide text-cloud-strong">
            Sisa jam &lt; {JAM_MENIPIS}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${saldoMenipis.length > 0 ? 'text-[#8A6D00]' : 'text-navy'}`}>
            {saldoMenipis.length}
          </p>
          <p className="text-xs text-cloud-strong">siswa perlu top-up</p>
        </div>

        <div className="rounded-lg border border-cloud bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-cloud-strong">
            Margin (semua kelas)
          </p>
          <p className="mt-1 text-2xl font-semibold text-navy">
            {formatRupiah(totalRevenue - totalCost)}
          </p>
          <p className="text-xs text-cloud-strong">
            dari {formatRupiah(totalRevenue)} pendapatan lunas
          </p>
        </div>
      </div>

      <div className="grid gap-5">
        <Kartu
          judul="Siswa dengan jam menipis"
          keterangan={`aktif, sisa kurang dari ${JAM_MENIPIS} jam`}
        >
          {saldoMenipis.length === 0 ? (
            <p className="text-sm text-cloud-strong">
              Semua siswa aktif masih punya jam cukup.
            </p>
          ) : (
            <ul className="divide-y divide-cloud">
              {saldoMenipis.map((s) => (
                <li key={s.enrollment_id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm text-navy">
                      {namaSiswaPerId.get(s.student_id) ?? 'Siswa'}
                    </p>
                    <p className="text-xs text-cloud-strong">
                      {namaKelasPerId.get(s.class_id) ?? 'Kelas'}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-navy">
                    sisa {formatJamPelajaran(s.hours_remaining)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Kartu>

        <Kartu
          judul="Invoice belum dibayar"
          keterangan={invoiceTua.length > 0 ? `${invoiceTua.length} lebih tua dari ${INVOICE_TUA_HARI} hari` : undefined}
        >
          {daftarInvoice.length === 0 ? (
            <p className="text-sm text-cloud-strong">Semua invoice sudah lunas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cloud text-left text-xs uppercase tracking-wide text-cloud-strong">
                    <th className="pb-2 pr-4 font-medium">Nomor</th>
                    <th className="pb-2 pr-4 font-medium">Siswa / Kelas</th>
                    <th className="pb-2 pr-4 font-medium">Nominal</th>
                    <th className="pb-2 font-medium">Umur</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarInvoice.map((inv) => {
                    const umurHari = Math.floor(
                      (Date.now() - new Date(inv.created_at).getTime()) / 86400000
                    );
                    const tua = inv.created_at < batasTua;

                    return (
                      <tr key={inv.id} className="border-b border-cloud last:border-0">
                        <td className="py-2 pr-4 text-navy">{inv.invoice_number}</td>
                        <td className="py-2 pr-4 text-cloud-strong">
                          {inv.pendaftaran?.siswa?.full_name ?? '-'}
                          {' · '}
                          {inv.pendaftaran?.kelas?.name ?? '-'}
                        </td>
                        <td className="py-2 pr-4 text-navy">
                          {formatRupiah(inv.amount)}
                        </td>
                        <td className="py-2">
                          <span className={tua ? 'font-medium text-[#8A6D00]' : 'text-cloud-strong'}>
                            {umurHari} hari
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>

        <Kartu
          judul="Margin per kelas"
          keterangan="pendapatan lunas dikurangi earnings tutor yang disetujui"
        >
          {barisKeuangan.length === 0 ? (
            <p className="text-sm text-cloud-strong">Belum ada kelas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cloud text-left text-xs uppercase tracking-wide text-cloud-strong">
                    <th className="pb-2 pr-4 font-medium">Kelas</th>
                    <th className="pb-2 pr-4 font-medium">Pendapatan lunas</th>
                    <th className="pb-2 pr-4 font-medium">Earnings tutor</th>
                    <th className="pb-2 pr-4 font-medium">Margin</th>
                    <th className="pb-2 font-medium">Rasio</th>
                  </tr>
                </thead>
                <tbody>
                  {barisKeuangan.map((b) => {
                    const margin = Number(b.margin);
                    const revenue = Number(b.revenue_paid);

                    return (
                      <tr key={b.class_id} className="border-b border-cloud last:border-0">
                        <td className="py-2 pr-4">
                          <Link
                            href={`/admin/kelas/${b.class_id}`}
                            className="font-medium text-navy hover:text-gold hover:underline"
                          >
                            {b.class_name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-cloud-strong">
                          {formatRupiah(revenue)}
                        </td>
                        <td className="py-2 pr-4 text-cloud-strong">
                          {formatRupiah(b.tutor_cost_approved)}
                        </td>
                        <td className={`py-2 pr-4 font-medium ${margin >= 0 ? 'text-navy' : 'text-danger'}`}>
                          {formatRupiah(margin)}
                        </td>
                        <td className="py-2">
                          {revenue > 0 ? (
                            <span className={margin / revenue < 0.3 ? 'text-[#8A6D00]' : 'text-cloud-strong'}>
                              {Math.round((margin / revenue) * 100)}%
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}
