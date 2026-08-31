/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Spotify-adjacent accent + dark surfaces.
        brand: '#1DB954',
        surface: {
          DEFAULT: '#121212',
          raised: '#1E1E1E',
          hover: '#282828',
        },
      },
    },
  },
  plugins: [],
};
