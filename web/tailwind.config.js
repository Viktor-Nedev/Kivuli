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
        // Dark base — reads as the flag's black. Kept from the original
        // shade-to-sun palette; only the accent colors below changed.
        shade: {
          900: '#0b1220',
          800: '#131c2e',
          700: '#1c2840',
          600: '#273553',
          400: '#4a5f86',
          200: '#8697b8',
        },
        // Primary accent, replacing the old amber "sun" family: a muted
        // Kenyan green, desaturated so it never sits at full flag saturation.
        // Used for "go"/positive status, links, and the primary brand accent.
        kenya: {
          green: {
            500: '#3d8361',
            400: '#5aa07d',
            300: '#8fc2a5',
          },
          // Danger/"stop" accent, muted flag red. Kept visually distinct from
          // kenya-green (never adjacent in one control) — full-saturation
          // red+green next to each other is a known deuteranopia/protanopia
          // failure pair, so both are desaturated and used in disjoint roles
          // instead of relying on hue alone.
          red: {
            500: '#b8433a',
            400: '#cc5c4f',
          },
          // Decorative-only accent for dividers/ornaments — never used for
          // text or status, so it can sit apart from the semantic palette.
          ochre: '#a8683d',
        },
        // A third, non-flag "wait"/caution state — collapsing it into green
        // or red would misrepresent an in-between status, so it keeps its
        // own warm-amber identity distinct from both.
        amber: {
          500: '#e8a33d',
          400: '#f2b955',
          300: '#f7cd82',
        },
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
