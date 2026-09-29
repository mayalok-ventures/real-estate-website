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
          dark: '#0A0A0A',
          light: '#F4F5F6',
          green: '#00E676',
          greenDark: '#00B359'
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['Inter', '"Plus Jakarta Sans"', 'sans-serif'],
        handwriting: ['Caveat', 'cursive'],
      }
    }
  }
};
