/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
      "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#D4AF37',
          light: '#F2CD5C',
          dark: '#A8841F',
        },
        gdblack: '#0B0B0C',
      },
    },
  },
  plugins: [],
}

