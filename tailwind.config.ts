import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Municipal/public-safety palette inherited from the prototype.
        navy: {
          DEFAULT: "#0f1d33",
          800: "#14253f",
          700: "#1b3052",
          ink: "#0b1626",
        },
        accent: {
          DEFAULT: "#2f6fd6",
          soft: "#e6efff",
          ink: "#1d4f9c",
        },
        ok: { DEFAULT: "#1f7a4d", soft: "#e3f3ea" },
        warn: { DEFAULT: "#b06b1a", soft: "#fbeed4" },
        danger: { DEFAULT: "#b3261e", soft: "#fae3e0" },
        info: { DEFAULT: "#2f6fd6", soft: "#e6efff" },
        pending: { DEFAULT: "#6b54b8", soft: "#ece6fb" },
        neutral: { DEFAULT: "#5a6a82", soft: "#eef1f6" },
        ink: "#11243f",
        text2: "#45556c",
        text3: "#6b7a91",
        line: "#e3e7ee",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
