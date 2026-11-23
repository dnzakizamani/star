// Supabase client untuk dipakai di Client Component ("use client").
//
// Bedanya dengan lib/supabase/server.ts hanya pada sumber cookie: di browser,
// cookie sudah otomatis ikut terkirim, jadi tidak perlu diatur manual.
//
// Catatan: file ini HANYA memakai anon key. Anon key aman ada di browser karena
// semua akses tetap dibatasi RLS di database. Service role key tidak boleh
// pernah masuk ke sini.

import { createBrowserClient } from '@supabase/ssr';

export function buatClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
