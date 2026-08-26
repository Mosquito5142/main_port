import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // greengradientnaturefood palette — ผูกกับ CSS variable ใน globals.css
        // เพื่อให้สลับโหมดมืด/สว่างได้โดยไม่ต้องแก้ทุกไฟล์ที่ใช้ text-forest/bg-mist ฯลฯ
        mist: 'rgb(var(--mist) / <alpha-value>)',
        leaf: 'rgb(var(--leaf) / <alpha-value>)',
        grass: 'rgb(var(--grass) / <alpha-value>)',
        forest: 'rgb(var(--forest) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        leafy: '0 10px 30px -12px rgba(27, 94, 32, 0.25)',
        'leafy-lg': '0 24px 60px -20px rgba(27, 94, 32, 0.35)',
      },
      backgroundImage: {
        'nature-food':
          'linear-gradient(135deg, #E8F5E9 0%, #A5D6A7 45%, #66BB6A 100%)',
        'forest-dive': 'linear-gradient(135deg, #66BB6A 0%, #1B5E20 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
