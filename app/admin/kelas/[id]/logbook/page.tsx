// Detail isi logbook satu kelas untuk satu bulan (sudut pandang admin).
//
// Admin membaca isi logbook di sini sebelum memutuskan setuju atau kembalikan.
// Aksi setuju/kembalikan tetap di halaman /admin/logbook supaya tidak ada dua
// tempat untuk melakukan hal yang sama.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatTanggalJam, formatJamPelajaran, namaBulan } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import type { EntriLogbook, Les, Logbook } from '@/lib/types';

type BarisEntri = EntriLogbook & {
  les: Les | null;
};

export default async function DetailLogbookKelas({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  // Semua logbook kelas ini, urut terbaru.
  const { data: logbook } = await supabase
    .from('logbooks')
    .select('*')
    .eq('class_id', id)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  const daftarLogbook = (logbook ?? []) as Logbook[];

  if (daftarLogbook.length === 0) {
    notFound();
  }

  // Kelas untuk judul halaman.
  const { data: kelas } = await supabase
    .from('classes')
    .select('name')
    .eq('id', id)
    .single();

  // Entri untuk semua logbook kelas ini, sekaligus les-nya.
  const { data: entri } = await supabase
    .from('logbook_entries')
    .select('*, les:lessons(*)')
    .in(
      'logbook_id',
      daftarLogbook.map((l) => l.id)
    )
    .order('created_at');

  const daftarEntri = (entri ?? []) as unknown as BarisEntri[];

  return (
    <KerangkaHalaman profil={profil}>
      <div className="mb-5">
        <Link href={`/admin/kelas/${id}`} className="text-sm text-cloud-strong hover:text-navy">
          &larr; {kelas?.name ?? 'Kelas'}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-navy">Logbook</h1>
      </div>

      <div className="grid gap-5">
        {daftarLogbook.map((lb) => {
          const entriLogbook = daftarEntri.filter((e) => e.logbook_id === lb.id);
          const totalJam = entriLogbook.reduce((jumlah, e) => {
            if (!e.les) return jumlah;
            const durasi =
              (new Date(e.les.ends_at).getTime() - new Date(e.les.starts_at).getTime()) /
              3600000;
            return jumlah + durasi;
          }, 0);

          return (
            <Kartu
              key={lb.id}
              judul={`${namaBulan(lb.period_month)} ${lb.period_year}`}
              keterangan={`${entriLogbook.length} entri · ${formatJamPelajaran(totalJam)}`}
              aksi={<BadgeStatus status={lb.status} />}
            >
              {lb.admin_note && (
                <p className="mb-4 rounded border border-gold/50 bg-gold-soft px-3 py-2 text-sm text-[#8A6D00]">
                  Catatan admin: {lb.admin_note}
                </p>
              )}

              {entriLogbook.length === 0 ? (
                <p className="text-sm text-cloud-strong">Belum ada entri.</p>
              ) : (
                <ul className="space-y-4">
                  {entriLogbook.map((e) => (
                    <li key={e.id} className="border-l-2 border-cloud pl-4">
                      <p className="text-xs text-cloud-strong">
                        {e.les ? formatTanggalJam(e.les.starts_at) : 'Les tidak ditemukan'}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-navy">{e.topic}</p>

                      <dl className="mt-2 space-y-1.5 text-sm">
                        <div>
                          <dt className="text-xs text-cloud-strong">Aktivitas</dt>
                          <dd className="text-navy">{e.activities}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-cloud-strong">Observasi tutor</dt>
                          <dd className="text-navy">{e.tutor_observation}</dd>
                        </div>
                        {e.next_recommendation && (
                          <div>
                            <dt className="text-xs text-cloud-strong">Rekomendasi berikutnya</dt>
                            <dd className="text-navy">{e.next_recommendation}</dd>
                          </div>
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          );
        })}
      </div>
    </KerangkaHalaman>
  );
}
