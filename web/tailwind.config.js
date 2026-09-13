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
         * Neutral base.
         *
         * Was a blue-grey ramp (#0b1220 -> #8697b8), and a count of every
         * colour class in the app found 76% of all usage sitting in it. That
         * is what made the interface read as uniformly grey no matter what
         * accent sat on top: there was no true black, no true white, and a
         * warm cream ink over a cool blue ground fighting each other at the
         * two highest-frequency positions.
         *
         * These are neutral greys on a near-black ground. The names are
         * unchanged so every component keeps working while the surfaces move
         * underneath.
         */
        shade: {
          900: '#000000', // page ground
          800: '#0e0e11', // raised surface
          700: '#2a2a30', // hairline / border
          600: '#3a3a42', // hover edge
          400: '#86868b', // secondary ink (Apple's own secondary grey)
          200: '#d2d2d7', // body ink
        },
        /**
         * Status, and only status.
         *
         * The old palette spent its whole accent budget on green and amber as
         * decoration, so colour carried no meaning: 81% of all accent usage
         * was those two families. Now green means go, amber means wait, red
         * means stop, and nothing else is tinted at all — which is what makes
         * a coloured thing worth looking at.
         *
         * Brighter than the old muted set because they now sit on black
         * rather than on a mid blue-grey, and they are never adjacent in one
         * control (the deuteranopia pair rule still holds).
         */
        kenya: {
          green: {
            500: '#248a3d',
            400: '#30d158', // system green on dark
            300: '#7ee2a8',
          },
          red: {
            500: '#d70015',
            400: '#ff453a', // system red on dark
          },
          // Decorative only — dividers and ornaments, never text or status.
          ochre: '#ac8e68',
        },
        amber: {
          500: '#c93400',
          400: '#ff9f0a', // system orange on dark
          300: '#ffd60a',
        },
        /**
         * The single non-status accent: links, focus rings, the one element
         * on a screen meant to pull the eye. Having exactly one means it
         * always reads as "this is interactive" rather than as decoration.
         */
        accent: {
          500: '#0a84ff',
          400: '#409cff',
          300: '#7ab8ff',
        },
        /** Primary ink. A true near-white, not the old warm cream. */
        bleach: '#f5f5f7',
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
