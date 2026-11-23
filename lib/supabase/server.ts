// Supabase client untuk dipakai di Server Component dan Server Action.
//
// Kenapa ada dua client?
// =========================
// Browser dan server menyimpan sesi login dengan cara berbeda:
//   - Browser : cookie di domain kita
//   - Server  : harus dibaca dari cookie request yang masuk
//
// Kalau memakai satu client untuk keduanya, sesi login akan hilang setiap kali
// server render halaman. Karena itu Supabase menyediakan pola dua client.
// File ini yang versi server. Pasangannya ada di lib/supabase/browser.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function buatClientServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Dipakai saat Supabase perlu MEMBACA sesi yang sudah ada.
        getAll() {
          return cookieStore.getAll();
        },

        // Dipakai saat Supabase perlu MENYIMPAN sesi baru setelah login.
        //
        // try/catch ini wajib, bukan kehati-hatian berlebihan: Server Component
        // tidak diizinkan menulis cookie. Kalau dipanggil dari sana, Supabase
        // tetap mencoba menulis dan akan melempar error. Error itu aman
        // diabaikan karena middleware yang akan menyegarkan sesinya.
        setAll(
          cookiesToSet: { name: string; value: string; options?: any }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Diabaikan dengan sengaja. Lihat penjelasan di atas.
          }
        },
      },
    }
  );
}
