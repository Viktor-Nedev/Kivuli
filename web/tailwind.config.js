import path from 'node:path';

const here = import.meta.dirname;

/** @type {import('tailwindcss').Config} */
export default {
  // Absolute globs: content paths resolve against the process cwd, not this
  // file, so relative patterns silently match nothing when run from the repo root.
  content: [path.join(here, 'index.html'), path.join(here, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        // Shade-to-sun axis: the physical thing the station measures.
        shade: {
          900: '#0b1220',
          800: '#131c2e',
          700: '#1c2840',
          600: '#273553',
          400: '#4a5f86',
          200: '#8697b8',
        },
        sun: {
          500: '#e8a33d',
          400: '#f2b955',
          300: '#f7cd82',
        },
        ember: '#d2603a',
        bleach: '#f5efe4',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
