/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Cairo"', '"Tajawal"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ecff',
          500: '#2f6fed',
          600: '#2359c9',
          700: '#1c469b',
        },
      },
    },
  },
  plugins: [],
};
