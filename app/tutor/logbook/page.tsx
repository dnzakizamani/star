// Halaman logbook tutor: mengisi entri untuk les yang sudah selesai.
//
// Alur yang ditampilkan di sini mengikuti siklus di database:
//   draft     -> tutor mengisi entri
//   submitted -> tutor kirim, entri terkunci
//   returned  -> admin minta perbaikan, tutor bisa edit lagi
//   approved  -> selesai, tidak bisa diubah siapa pun

import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatTanggal, formatJam, namaBulan } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
import { simpanEntri, kirimLogbook } from '../aksi';
import type { Kelas, Les, Logbook, EntriLogbook } from '@/lib/types';

type BarisLes = Les & {
  kelas: { name: string } | null;
  entri: EntriLogbook | EntriLogbook[] | null;
};

export default async function HalamanLogbookTutor({
  searchParams,
}: {
  searchParams: Promise<{ kelas?: string }>;
}) {
  const { kelas: filterKelas } = await searchParams;
  const profil = await wajibPeran('tutor');
  const supabase = await buatClientServer();

  // Kelas yang diampu.
  const { data: kelas } = await supabase
    .from('classes')
    .select('*')
    .eq('tutor_id', profil.id)
    .order('name');

  const daftarKelas = (kelas ?? []) as Kelas[];
  const idKelas = filterKelas
    ? daftarKelas.filter((k) => k.id === filterKelas).map((k) => k.id)
    : daftarKelas.map((k) => k.id);

  // Logbook milik kelas tutor ini. RLS sudah membatasi, filter di sini hanya
  // untuk memilih kelas tertentu.
  let queryLogbook = supabase.from('logbooks').select('*');
  if (idKelas.length > 0) {
    queryLogbook = queryLogbook.in('class_id', idKelas);
  }

  const { data: logbook } = await queryLogbook
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  const daftarLogbook = (logbook ?? []) as Logbook[];

  // Les yang sudah selesai beserta entri logbook-nya (kalau sudah diisi).
  const { data: les } = idKelas.length
    ? await supabase
        .from('lessons')
        .select('*, kelas:classes(name), entri:logbook_entries(*)')
        .in('class_id', idKelas)
        .eq('status', 'completed')
        .order('starts_at', { ascending: false })
        .limit(40)
    : { data: [] };

  const daftarLes = (les ?? []) as unknown as BarisLes[];

  // Peta nama kelas untuk judul.
  const namaKelasPerId = new Map(daftarKelas.map((k) => [k.id, k.name]));

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-navy">Logbook</h1>

      {daftarKelas.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          <Link
            href="/tutor/logbook"
            className={`rounded border px-3 py-1 text-sm ${
              !filterKelas
                ? 'border-gold bg-gold-soft text-gold'
                : 'border-cloud bg-surface text-cloud-strong hover:text-navy'
            }`}
          >
            Semua kelas
          </Link>
          {daftarKelas.map((k) => (
            <Link
              key={k.id}
              href={`/tutor/logbook?kelas=${k.id}`}
              className={`rounded border px-3 py-1 text-sm ${
                filterKelas === k.id
                  ? 'border-gold bg-gold-soft text-gold'
                  : 'border-cloud bg-surface text-cloud-strong hover:text-navy'
              }`}
            >
              {k.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5">
        {daftarLogbook.map((lb) => {
          // Les yang masuk periode logbook ini dan satu kelas.
          const lesPeriode = daftarLes.filter((l) => {
            if (l.class_id !== lb.class_id) return false;
            const tanggal = new Date(l.starts_at);
            return (
              tanggal.getUTCFullYear() === lb.period_year &&
              tanggal.getUTCMonth() + 1 === lb.period_month
            );
          });

          const bisaDiisi = lb.status === 'draft' || lb.status === 'returned';

          return (
            <Kartu
              key={lb.id}
              judul={`${namaKelasPerId.get(lb.class_id) ?? 'Kelas'} · ${namaBulan(lb.period_month)} ${lb.period_year}`}
              keterangan={`${lesPeriode.length} les selesai`}
              aksi={<BadgeStatus status={lb.status} />}
            >
              {lb.admin_note && (
                <p className="mb-4 rounded border border-gold/50 bg-gold-soft px-3 py-2 text-sm text-[#8A6D00]">
                  Dikembalikan admin: {lb.admin_note}
                </p>
              )}

              {lesPeriode.length === 0 ? (
                <p className="text-sm text-cloud-strong">
                  Belum ada les selesai di bulan ini.
                </p>
              ) : (
                <ul className="space-y-5">
                  {lesPeriode.map((l) => {
                    // Relasi satu-ke-satu kadang array.
                    const entri = Array.isArray(l.entri) ? l.entri[0] : l.entri;

                    return (
                      <li key={l.id} className="border-l-2 border-cloud pl-4">
                        <p className="text-xs text-cloud-strong">
                          {formatTanggal(l.starts_at)} · {formatJam(l.starts_at)} -{' '}
                          {formatJam(l.ends_at)}
                        </p>

                        {bisaDiisi ? (
                          <div className="mt-2">
                            <FormAksi
                              action={simpanEntri}
                              labelTombol={entri ? 'Perbarui entri' : 'Simpan entri'}
                              varianTombol="sekunder"
                            >
                              <input type="hidden" name="les_id" value={l.id} />
                              <input type="hidden" name="logbook_id" value={lb.id} />

                              <IsianTeks
                                label="Topik"
                                name="topik"
                                defaultValue={entri?.topic ?? ''}
                                placeholder="Persamaan kuadrat: akar dan diskriminan"
                              />

                              <IsianArea
                                label="Aktivitas"
                                name="aktivitas"
                                defaultValue={entri?.activities ?? ''}
                                placeholder="Apa yang dikerjakan di kelas"
                              />

                              <IsianArea
                                label="Observasi tutor"
                                name="observasi"
                                defaultValue={entri?.tutor_observation ?? ''}
                                placeholder="Bagaimana pemahaman siswa"
                              />

                              <IsianArea
                                label="Rekomendasi berikutnya (opsional)"
                                name="rekomendasi"
                                defaultValue={entri?.next_recommendation ?? ''}
                                wajib={false}
                              />
                            </FormAksi>
                          </div>
                        ) : entri ? (
                          // Logbook terkunci: tampilkan sebagai teks, bukan form.
                          <div className="mt-1">
                            <p className="text-sm font-medium text-navy">{entri.topic}</p>
                            <p className="mt-1 text-sm text-cloud-strong">{entri.activities}</p>
                            <p className="mt-1 text-sm text-cloud-strong">
                              {entri.tutor_observation}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-cloud-strong">
                            Belum ada entri untuk les ini.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {bisaDiisi && lesPeriode.length > 0 && (
                <div className="mt-5 border-t border-cloud pt-4">
                  <p className="mb-2 text-xs text-cloud-strong">
                    Isi semua les di atas, lalu kirim ke admin. Setelah dikirim,
                    entri tidak bisa diubah sampai admin mengembalikannya.
                  </p>
                  <FormAksi action={kirimLogbook} labelTombol="Kirim ke admin">
                    <input type="hidden" name="logbook_id" value={lb.id} />
                  </FormAksi>
                </div>
              )}
            </Kartu>
          );
        })}

        {daftarLogbook.length === 0 && (
          <Kartu>
            <p className="text-sm text-cloud-strong">
              Belum ada logbook. Logbook terbuka otomatis setelah les ditandai
              selesai.
            </p>
          </Kartu>
        )}
      </div>
    </KerangkaHalaman>
  );
}

// Dua komponen isian di bawah ini hanya dipakai di halaman ini.
// Kalau nanti halaman lain butuh, pindahkan ke /components.

function IsianTeks({
  label,
  name,
  defaultValue,
  placeholder,
  wajib = true,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  wajib?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`${name}`} className="mb-1 block text-sm font-medium text-navy">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={wajib}
        className="w-full rounded border border-cloud px-3 py-2 text-sm focus:border-gold focus:outline-none"
      />
    </div>
  );
}

function IsianArea({
  label,
  name,
  defaultValue,
  placeholder,
  wajib = true,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  wajib?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-navy">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={wajib}
        className="w-full rounded border border-cloud px-3 py-2 text-sm focus:border-gold focus:outline-none"
      />
    </div>
  );
}
