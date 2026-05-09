/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0e14",
          elev: "#141823",
          card: "#1c2230",
        },
        border: { subtle: "#2a3142" },
        good: "#22c55e",
        meh: "#eab308",
        bad: "#ef4444",
        accent: "#c89b3c",
      },
    },
  },
  plugins: [],
};
