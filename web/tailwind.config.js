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
         * The ground, and the light on it.
         *
         * Not flat black. A previous pass reduced everything to #000 and one
         * blue accent and the result was sterile — an empty terminal rather
         * than a product. Apple's dark surfaces are never one value: they sit
         * on a deep blue-violet that warms toward the light source, and the
         * elevation between them is real, not a 1px border.
         *
         * So this ramp carries a slight cool cast that gives the glass
         * something to tint, and the steps are far enough apart to read as
         * distance.
         */
        shade: {
          950: '#050509', // deepest — page ground behind everything
          900: '#0a0a12', // page ground
          800: '#12121c', // raised surface
          700: '#1c1c2a', // hairline / border
          600: '#2a2a3d', // hover edge
          500: '#3d3d54', // disabled ink
          400: '#8b8ba7', // secondary ink
          200: '#d8d8e4', // body ink
        },
        /**
         * Status, and only status: go, wait, stop.
         *
         * Bright enough to glow against a dark ground, because they are now
         * used with light behind them rather than as flat fills.
         */
        kenya: {
          green: {
            600: '#0f7a3d',
            500: '#1db954',
            400: '#34e07a',
            300: '#7ef2ab',
          },
          red: {
            600: '#c11a2b',
            500: '#f0325a',
            400: '#ff5c7a',
          },
          ochre: '#c9a227',
        },
        amber: {
          600: '#b8690a',
          500: '#f59e0b',
          400: '#fbbf24',
          300: '#fcd34d',
        },
        /**
         * The interaction accent, as a family rather than one value.
         *
         * A single flat blue cannot make a gradient, a glow or a focus ring
         * that reads as the same thing at three depths — which is why the
         * previous pass looked cheap. Violet at the far end lets every accent
         * gradient travel rather than sit.
         */
        accent: {
          700: '#4c1d95',
          600: '#6d28d9',
          500: '#7c5cff', // primary — links, focus, the eye-catcher
          400: '#9d7fff',
          300: '#c4b5fd',
        },
        /** A second hue, so gradients have somewhere to go. */
        cyan: {
          500: '#06b6d4',
          400: '#22d3ee',
          300: '#67e8f9',
        },
        /** Primary ink — a fraction cool, to sit with the ground. */
        bleach: '#f7f7fb',
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
