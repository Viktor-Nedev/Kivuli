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
        /**
         * The ground: warm earth at night, not a black screen.
         *
         * Sampled from the project's own photographs. Quantising
         * hero-community.jpg returns #301800, #483018 and #603018 as dominant
         * families, and the saturated mid-tones are 45% red, 21% orange, 19%
         * yellow-ochre. That is laterite soil, dry grass and Maasai cloth —
         * the actual subject.
         *
         * A previous pass put violet and cyan neon over this. It had nothing
         * to do with a weather station in Juja, and it looked like it.
         *
         * These are deep warm neutrals: a brown-black ground with enough red
         * in it to feel like soil rather than ink, rising to a bone ink that
         * reads as paper in low light.
         */
        shade: {
          950: '#0c0907', // deepest — behind everything
          900: '#141010', // page ground
          800: '#1f1917', // raised surface
          700: '#2e2622', // hairline
          600: '#403530', // hover edge
          500: '#5c4d44', // disabled
          400: '#a3948a', // secondary ink
          200: '#e4dcd2', // body ink
        },
        /**
         * Status: go, wait, stop — and nothing else is tinted.
         *
         * Muted to sit inside a warm scheme. A pure #34e07a next to earth
         * tones reads as a notification badge, not as a field condition.
         */
        kenya: {
          green: {
            600: '#3f6b46',
            500: '#557e58',
            400: '#7a9e76',
            300: '#a8c3a0',
          },
          red: {
            600: '#8f2f28',
            500: '#b03f33',
            400: '#c96a58',
          },
          ochre: '#b8894a',
        },
        amber: {
          600: '#9a6420',
          500: '#c08434',
          400: '#d9a855',
          300: '#e8c48a',
        },
        /**
         * The one non-status accent: terracotta.
         *
         * Taken straight from the photograph's dominant hue. It carries links
         * and focus, so "this is interactive" is one consistent signal — and
         * it belongs to the subject rather than being imported from a tech
         * palette.
         */
        accent: {
          700: '#7a3b26',
          600: '#9c4d31',
          500: '#b9603c',
          400: '#cf7d55',
          300: '#e3a680',
        },
        /** The second hue for gradients: dry savannah grass, not cyan. */
        sage: {
          500: '#6b7350',
          400: '#8a9268',
          300: '#adb48c',
        },
        /** Primary ink — bone, the warm paper of a field notebook. */
        bleach: '#f7f2ea',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        // The KIVULI wordmark only. Deliberately a *wide* grotesque against
        // the condensed `display` face — a condensed alternative (Anton)
        // would read as the same family at a heavier weight rather than as a
        // distinct logotype. "Arial Black" leads the fallbacks so the
        // font-swap doesn't visibly thin the wordmark before Archivo loads.
        wordmark: ['"Archivo Black"', '"Arial Black"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
