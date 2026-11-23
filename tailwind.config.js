/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Flat palette, no gradients anywhere in this app.
        // Neutral warm greys for structure, one teal accent for actions.
        ink: '#1c1917',        // primary text
        muted: '#78716c',      // secondary text
        line: '#e7e5e4',       // borders
        surface: '#ffffff',    // cards
        canvas: '#faf9f7',     // page background
        accent: {
          DEFAULT: '#0f766e',  // teal-700, buttons and links
          soft: '#f0fdfa',     // teal-50, subtle backgrounds
        },
        warn: '#b45309',       // amber-700, unpaid / returned
        danger: '#b91c1c',     // red-700, errors
        ok: '#15803d',         // green-700, paid / approved
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
