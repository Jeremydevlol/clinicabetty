/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        serif: ['"DM Serif Display"', "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.04)",
        elevated: "0 4px 24px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
}
