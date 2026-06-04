import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        notion: {
          bg: "var(--color-notion-bg)",
          "bg-secondary": "var(--color-notion-bg-secondary)",
          sidebar: "#191919",
          "sidebar-hover": "#2f2f2f",
          text: "var(--color-notion-text)",
          "text-secondary": "var(--color-notion-text-secondary)",
          border: "var(--color-notion-border)",
        },
        moneta: {
          DEFAULT: "#7c3aed",
          light: "#ede9fe",
          dark: "#5b21b6",
        },
        keeper: {
          DEFAULT: "#2563eb",
          light: "#dbeafe",
        },
        clio: {
          DEFAULT: "#d97706",
          light: "#fef3c7",
        },
        severity: {
          high: "#dc2626",
          "high-bg": "#fef2f2",
          medium: "#d97706",
          "medium-bg": "#fffbeb",
          low: "#16a34a",
          "low-bg": "#f0fdf4",
        },
      },
      fontFamily: {
        sans: ["'Noto Sans KR'", "Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      fontSize: {
        "editor-title": ["2rem", { lineHeight: "1.3", fontWeight: "700" }],
        "editor-body": ["1rem", { lineHeight: "1.8" }],
      },
      animation: {
        "slide-in": "slideIn 0.2s ease-out",
        "fade-in": "fadeIn 0.15s ease-out",
      },
      keyframes: {
        slideIn: {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
