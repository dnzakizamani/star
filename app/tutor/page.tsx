// Beranda tutor: jadwal les mendatang + daftar kelas yang diampu.
//
// Tutor tidak melihat rate siswa sama sekali. Itu bukan disembunyikan di sini:
// kolom student_rate memang null untuk tutor karena view v_classes_safe
// mem-mask-nya di database.

import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatTanggal, formatJam } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
// buatLes tinggal di app/admin/aksi.ts dan dibagikan admin+tutor. Import
// lintas folder ini disengaja: tanpa barrel file, path eksplisit lebih mudah
// diikuti daripada salin-tempel aksinya.
import { selesaikanLes } from './aksi';
import { buatLes } from '@/app/admin/aksi';
import type { Kelas, Les } from '@/lib/types';

type JadwalLes = Les & {
  kelas: { name: string } | null;
};

export default async function BerandaTutor() {
  const profil = await wajibPeran('tutor');
  const supabase = await buatClientServer();

  // Kelas yang diampu tutor ini.
  const { data: kelas } = await supabase
    .from('classes')
    .select('*')
    .eq('tutor_id', profil.id)
    .order('created_at', { ascending: false });

  const daftarKelas = (kelas ?? []) as Kelas[];
  const idKelas = daftarKelas.map((k) => k.id);

  // Les mendatang dan yang belum selesai.
  const { data: les } = idKelas.length
    ? await supabase
        .from('lessons')
        .select('*, kelas:classes(name)')
        .in('class_id', idKelas)
        .eq('status', 'scheduled')
        .order('starts_at')
    : { data: [] };

  const jadwal = (les ?? []) as unknown as JadwalLes[];

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-navy">Jadwal</h1>

      <div className="grid gap-5">
        <Kartu
          judul="Les mendatang"
          keterangan="Tandai selesai setelah les berlangsung agar logbook terbuka"
        >
          {jadwal.length === 0 ? (
            <p className="text-sm text-cloud-strong">
              Tidak ada les terjadwal. Jadwalkan lewat form di bawah.
            </p>
          ) : (
            <ul className="divide-y divide-cloud">
              {jadwal.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-navy">
                      {l.kelas?.name ?? 'Kelas'}
                    </p>
                    <p className="text-xs text-cloud-strong">
                      {formatTanggal(l.starts_at)} · {formatJam(l.starts_at)} -{' '}
                      {formatJam(l.ends_at)}
                    </p>
                  </div>

                  <FormAksi
                    action={selesaikanLes}
                    labelTombol="Tandai selesai"
                    varianTombol="sekunder"
                  >
                    <input type="hidden" name="les_id" value={l.id} />
                  </FormAksi>
                </li>
              ))}
            </ul>
          )}

          {daftarKelas.length > 0 && (
            <div className="mt-4 border-t border-cloud pt-4">
              <p className="mb-2 text-sm font-medium text-navy">Jadwalkan les</p>
              <FormAksi action={buatLes} labelTombol="Simpan jadwal">
                {daftarKelas.length === 1 ? (
                  <input type="hidden" name="kelas_id" value={daftarKelas[0].id} />
                ) : (
                  <div>
                    <label
                      htmlFor="kelas_id"
                      className="mb-1 block text-sm font-medium text-navy"
                    >
                      Kelas
                    </label>
                    <select
                      id="kelas_id"
                      name="kelas_id"
                      required
                      className="w-full rounded border border-cloud px-3 py-2 text-sm focus:border-gold focus:outline-none"
                    >
                      {daftarKelas.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="mulai"
                      className="mb-1 block text-sm font-medium text-navy"
                    >
                      Mulai (WIB)
                    </label>
                    <input
                      id="mulai"
                      name="mulai"
                      type="datetime-local"
                      required
                      className="w-full rounded border border-cloud px-3 py-2 text-sm focus:border-gold focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="selesai"
                      className="mb-1 block text-sm font-medium text-navy"
                    >
                      Selesai (WIB)
                    </label>
                    <input
                      id="selesai"
                      name="selesai"
                      type="datetime-local"
                      required
                      className="w-full rounded border border-cloud px-3 py-2 text-sm focus:border-gold focus:outline-none"
                    />
                  </div>
                </div>
              </FormAksi>
            </div>
          )}
        </Kartu>

        <Kartu judul="Kelas yang saya ampu" keterangan={`${daftarKelas.length} kelas`}>
          {daftarKelas.length === 0 ? (
            <p className="text-sm text-cloud-strong">Belum ada kelas yang ditugaskan.</p>
          ) : (
            <ul className="divide-y divide-cloud">
              {daftarKelas.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-navy">{k.name}</p>
                    <p className="text-xs text-cloud-strong">Kapasitas {k.capacity} siswa</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <BadgeStatus status={k.status} />
                    <Link
                      href={`/tutor/logbook?kelas=${k.id}`}
                      className="text-sm text-gold hover:underline"
                    >
                      Logbook
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}
