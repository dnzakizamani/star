// Daftar kelas + form tambah kelas di halaman yang sama.
//
// Sengaja tidak dipisah ke /admin/kelas/baru: satu form tiga kolom tidak
// sepadan dengan satu halaman penuh, dan memisahkannya membuat user harus
// klik bolak-balik untuk hal yang sama.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
import { buatKelas } from '../aksi';
import type { Kelas } from '@/lib/types';
import Link from 'next/link';

type BarisKelas = Kelas & {
  tutor: { full_name: string } | null;
  pendaftaran: { id: string; status: string }[];
};

export default async function HalamanKelas() {
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  const { data: kelas } = await supabase
    .from('v_classes_safe')
    .select('*, tutor:profiles!classes_tutor_id_fkey(full_name), pendaftaran:enrollments(id, status)')
    .order('created_at', { ascending: false });

  const daftarKelas = (kelas ?? []) as unknown as BarisKelas[];

  // Tutor untuk pilihan di form.
  const { data: tutor } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'tutor')
    .order('full_name');

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-ink">Kelas</h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Kartu judul="Daftar kelas" keterangan={`${daftarKelas.length} kelas`}>
          {daftarKelas.length === 0 ? (
            <p className="text-sm text-muted">Belum ada kelas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4 font-medium">Nama</th>
                    <th className="pb-2 pr-4 font-medium">Tutor</th>
                    <th className="pb-2 pr-4 font-medium">Siswa</th>
                    <th className="pb-2 pr-4 font-medium">Rate</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarKelas.map((k) => {
                    const aktif = k.pendaftaran.filter(
                      (p) => p.status === 'active'
                    ).length;

                    return (
                      <tr key={k.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4">
                          <Link
                            href={`/admin/kelas/${k.id}`}
                            className="font-medium text-ink hover:text-accent hover:underline"
                          >
                            {k.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted">
                          {k.tutor?.full_name ?? '-'}
                        </td>
                        <td className="py-2 pr-4 text-muted">
                          {aktif}/{k.capacity}
                        </td>
                        <td className="py-2 pr-4 text-muted">
                          {formatRupiah(k.student_rate)}
                        </td>
                        <td className="py-2">
                          <BadgeStatus status={k.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>

        <Kartu judul="Tambah kelas" id="tambah-kelas">
          {daftarKelas.length > 0 && tutor?.length === 0 ? (
            <p className="text-sm text-muted">
              Belum ada tutor. Tambahkan user dengan peran tutor dulu.
            </p>
          ) : (
            <FormAksi action={buatKelas} labelTombol="Simpan kelas">
              <Isian label="Nama kelas" name="nama" placeholder="Matematika SMA - Grup B" />

              <div>
                <label htmlFor="tutor_id" className="mb-1 block text-sm font-medium text-ink">
                  Tutor
                </label>
                <select
                  id="tutor_id"
                  name="tutor_id"
                  required
                  className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">Pilih tutor</option>
                  {(tutor ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <Isian label="Kapasitas" name="kapasitas" type="number" defaultValue="6" />
              <Isian
                label="Rate siswa / jam"
                name="rate_siswa"
                type="number"
                defaultValue="100000"
              />
              <Isian
                label="Rate tutor / jam"
                name="rate_tutor"
                type="number"
                defaultValue="60000"
              />
            </FormAksi>
          )}
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}

// Isian teks sederhana. Dipakai berkali-kali di halaman ini; kalau nanti
// dibutuhkan di halaman lain, pindahkan ke /components.
function Isian({
  label,
  name,
  type = 'text',
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required
        className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}
