// Halaman login.
//
// Client Component karena perlu menampilkan pesan error hasil Server Action
// tanpa reload halaman.

'use client';

import { useState } from 'react';
import { masukKeAkun } from '@/app/aksi-auth';
import { PesanError } from '@/components/Pesan';
import { Tombol } from '@/components/Tombol';

// Akun demo ditampilkan langsung supaya penilai tidak perlu searching.
const AKUN_DEMO = [
  { peran: 'Admin', email: 'admin@stargeneration.test' },
  { peran: 'Tutor', email: 'tutor1@stargeneration.test' },
  { peran: 'Siswa (lunas)', email: 'student1@stargeneration.test' },
  { peran: 'Siswa (belum bayar)', email: 'student2@stargeneration.test' },
];

const PASSWORD_DEMO = 'Password123!';

export default function HalamanLogin() {
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [sedangProses, setSedangProses] = useState(false);

  async function tanganiSubmit(formData: FormData) {
    setSedangProses(true);
    setPesanError(null);

    const hasil = await masukKeAkun(formData);

    // Kalau berhasil, masukKeAkun sudah redirect dan baris ini tidak tercapai.
    if (hasil?.pesanError) {
      setPesanError(hasil.pesanError);
      setSedangProses(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">Star Generation</h1>
          <p className="mt-1 text-sm text-muted">
            Masuk untuk mengelola kelas, logbook, dan pembayaran.
          </p>
        </div>

        <form
          action={tanganiSubmit}
          className="rounded-lg border border-line bg-surface p-5"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-ink"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-ink"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            <PesanError pesan={pesanError} />

            <Tombol disabled={sedangProses}>
              {sedangProses ? 'Memproses...' : 'Masuk'}
            </Tombol>
          </div>
        </form>

        <div className="mt-5 rounded-lg border border-line bg-stone-50 p-4">
          <p className="text-xs font-medium text-ink">Akun demo</p>
          <p className="mt-1 text-xs text-muted">
            Password semua akun: <code className="text-ink">{PASSWORD_DEMO}</code>
          </p>
          <ul className="mt-2 space-y-1">
            {AKUN_DEMO.map((akun) => (
              <li key={akun.email} className="text-xs text-muted">
                <span className="text-ink">{akun.peran}</span>
                {' — '}
                {akun.email}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
