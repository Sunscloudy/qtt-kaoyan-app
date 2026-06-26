import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tea: '#5b8c7a',
        rosepaper: '#fff7f2',
        ink: '#24312e'
      },
      boxShadow: {
        soft: '0 18px 45px rgba(61, 72, 68, 0.12)'
      }
    }
  },
  plugins: []
} satisfies Config;
