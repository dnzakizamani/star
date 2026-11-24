/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Token dari Star Generation theme (lihat docs/take-home-test-fullstack.pdf
      // bagian "Visual theme"). Semua warna di aplikasi wajib lewat token ini,
      // jadi kalau brand berubah cukup ubah di satu tempat.
      colors: {
        navy: {
          DEFAULT: '#2F3F5F', // primary text, sidebar, primary buttons
          soft: '#3E517A',    // hover state untuk navy
        },
        gold: {
          DEFAULT: '#F1C019', // accent, highlights, active states
          soft: '#FDF3CE',    // subtle backgrounds (badge unpaid, dsb.)
        },
        surface: '#FAFDFF',   // cards and page background
        cloud: {
          DEFAULT: '#E0E2E7', // borders
          strong: '#6E7585',  // muted text
        },
        success: '#0AB848',   // Paid, Approved
        danger: '#FF2819',    // destructive, unpaid urgent
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Slightly larger base so dense tables stay readable.
        base: ['15px', '1.6'],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
};
