// Logbook yang bisa dibaca siswa.
//
// Hanya logbook berstatus approved yang terlihat, dan hanya untuk kelas yang
// invoice-nya lunas. Keduanya ditegakkan RLS di database, jadi halaman ini
// tidak perlu menyaring apa pun secara manual.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatTanggalJam, formatJamPelajaran, namaBulan } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import type { EntriLogbook, Les, Logbook } from '@/lib/types';

type BarisLogbook = Logbook & {
  kelas: { name: string } | null;
};

type BarisEntri = EntriLogbook & {
  les: Les | null;
};

export default async function HalamanLogbookSiswa() {
  const profil = await wajibPeran('student');
  const supabase = await buatClientServer();

  const { data: logbook } = await supabase
    .from('logbooks')
    .select('*, kelas:classes(name)')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  const daftarLogbook = (logbook ?? []) as unknown as BarisLogbook[];

  if (daftarLogbook.length === 0) {
    return (
      <KerangkaHalaman profil={profil}>
        <h1 className="mb-5 text-lg font-semibold text-ink">Logbook</h1>
        <Kartu>
          <p className="text-sm text-muted">
            Belum ada logbook yang dibagikan. Logbook muncul di sini setelah admin
            menyetujuinya.
          </p>
        </Kartu>
      </KerangkaHalaman>
    );
  }

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
      <h1 className="mb-5 text-lg font-semibold text-ink">Logbook</h1>

      <div className="grid gap-5">
        {daftarLogbook.map((lb) => {
          const entriLogbook = daftarEntri.filter((e) => e.logbook_id === lb.id);

          return (
            <Kartu
              key={lb.id}
              judul={`${lb.kelas?.name ?? 'Kelas'} · ${namaBulan(lb.period_month)} ${lb.period_year}`}
              keterangan={`${entriLogbook.length} pertemuan`}
            >
              {entriLogbook.length === 0 ? (
                <p className="text-sm text-muted">Belum ada catatan pertemuan.</p>
              ) : (
                <ul className="space-y-4">
                  {entriLogbook.map((e) => (
                    <li key={e.id} className="border-l-2 border-line pl-4">
                      <p className="text-xs text-muted">
                        {e.les
                          ? formatTanggalJam(e.les.starts_at)
                          : 'Tanggal tidak tersedia'}
                        {e.les && (
                          <>
                            {' · '}
                            {formatJamPelajaran(
                              (new Date(e.les.ends_at).getTime() -
                                new Date(e.les.starts_at).getTime()) /
                                3600000
                            )}
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-ink">{e.topic}</p>

                      <dl className="mt-2 space-y-1.5 text-sm">
                        <div>
                          <dt className="text-xs text-muted">Aktivitas</dt>
                          <dd className="text-ink">{e.activities}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Catatan tutor</dt>
                          <dd className="text-ink">{e.tutor_observation}</dd>
                        </div>
                        {e.next_recommendation && (
                          <div>
                            <dt className="text-xs text-muted">Saran berikutnya</dt>
                            <dd className="text-ink">{e.next_recommendation}</dd>
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
