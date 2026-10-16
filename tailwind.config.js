/** @type {import('tailwindcss').Config} */
import { fileURLToPath } from "node:url";

const colors = "(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const shades = "(50|100|200|300|400|500|600|700|800|900|950)";

// Absolute path: the dev server's cwd is not always the project root.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\\/g, "/");

export default {
	content: [`${root}src/mainview/**/*.{html,js,ts,jsx,tsx}`],
	// Classes are typed at runtime in the style editor, so generate the common ones up front.
	safelist: [
		{ pattern: new RegExp(`^(bg|text|border)-${colors}-${shades}$`) },
		{ pattern: /^(bg|text|border)-(white|black|transparent)$/ },
		{ pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/ },
		{ pattern: /^font-(thin|light|normal|medium|semibold|bold|extrabold|sans|serif|mono)$/ },
		{ pattern: /^(p|px|py)-(0|1|2|3|4|5|6|8|10|12|16)$/ },
		{ pattern: /^leading-(none|tight|snug|normal|relaxed|loose)$/ },
		{ pattern: /^rounded(-(none|sm|md|lg|xl|2xl|full))?$/ },
		{ pattern: /^w-(48|56|64|72|80|96)$/ },
	],
	theme: {
		extend: {},
	},
	plugins: [],
};
