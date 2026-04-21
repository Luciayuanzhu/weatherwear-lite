import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#20242a",
        mist: "#f5f7fb",
        line: "#d9e1ea",
        field: "#ffffff",
        leaf: "#2f7d57",
        sky: "#356f9f",
        sun: "#b87320"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(30, 41, 59, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

