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
import { selesaikanLes } from './aksi';
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
      <h1 className="mb-5 text-lg font-semibold text-ink">Jadwal</h1>

      <div className="grid gap-5">
        <Kartu
          judul="Les mendatang"
          keterangan="Tandai selesai setelah les berlangsung agar logbook terbuka"
        >
          {jadwal.length === 0 ? (
            <p className="text-sm text-muted">
              Tidak ada les terjadwal. Admin yang menjadwalkan les.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {jadwal.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {l.kelas?.name ?? 'Kelas'}
                    </p>
                    <p className="text-xs text-muted">
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
        </Kartu>

        <Kartu judul="Kelas yang saya ampu" keterangan={`${daftarKelas.length} kelas`}>
          {daftarKelas.length === 0 ? (
            <p className="text-sm text-muted">Belum ada kelas yang ditugaskan.</p>
          ) : (
            <ul className="divide-y divide-line">
              {daftarKelas.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{k.name}</p>
                    <p className="text-xs text-muted">Kapasitas {k.capacity} siswa</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <BadgeStatus status={k.status} />
                    <Link
                      href={`/tutor/logbook?kelas=${k.id}`}
                      className="text-sm text-accent hover:underline"
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
