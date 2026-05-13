/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
        fontFamily: {
        sans: ['Chopsic', 'sans-serif'], // <-- use Chopsic for all font-sans classes
      },
      colors: {
        primary: '#1E40AF',  // royal blue
        secondary: '#3B82F6', // light blue
      },
    },
  },
  plugins: [],
};
