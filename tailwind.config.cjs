module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        darkGreen: '#0A1C16',
        lightBg: '#F4F6F4',
        brandGreen: '#4ADE80',
        textDark: '#111827',
        textLight: '#F3F4F6',
        brand: {
          dark: '#0A1C16',
          darkSurface: '#0E271F',
          darkCard: '#133329',
          light: '#F4F6F4',
          green: '#4ADE80',
          greenDark: '#22c55e',
          greenHover: '#22c55e'
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        handwriting: ['Caveat', 'cursive'],
      }
    }
  }
};
