import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';

// Point Tailwind at this directory's config explicitly: the Vite root is
// web/, but PostCSS otherwise resolves the config from the process cwd.
export default {
  plugins: [tailwindcss({ config: path.resolve(import.meta.dirname, 'tailwind.config.js') }), autoprefixer()],
};
