import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        studio: {
          ink: "#ffffff",
          panel: "#ffffff",
          panelSoft: "#f4f6f8",
          border: "#dce2ea",
          text: "#101827",
          muted: "#667085",
          accent: "#14966f",
          amber: "#f3b35b"
        }
      }
    }
  },
  plugins: []
};

export default config;
