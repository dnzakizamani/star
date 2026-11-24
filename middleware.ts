// Middleware: menyegarkan sesi login pada setiap request.
//
// Kenapa perlu?
// =========================
// Access token Supabase berumur pendek (1 jam). Tanpa middleware ini, user yang
// membuka halaman setelah 1 jam akan terlihat logout padahal refresh token-nya
// masih valid. Middleware memperbarui token sebelum halaman dirender.
//
// Ini satu-satunya tempat di aplikasi yang boleh menulis cookie sesi.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() memicu refresh token kalau sudah kedaluwarsa.
  // Jangan diganti getSession(): itu hanya membaca cookie tanpa memvalidasi.
  await supabase.auth.getUser();

  // Header keamanan. Dipasang di sini karena middleware jalan untuk semua
  // route, jadi tidak perlu diulang di setiap halaman.
  //
  // X-Frame-Options mencegah halaman ini di-embed di iframe situs lain
  // (clickjacking). nosniff mencegah browser menebak tipe file.
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    // Semua route kecuali file statis dan gambar.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
