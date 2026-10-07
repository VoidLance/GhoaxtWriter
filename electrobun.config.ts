import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "GhoaxtWriter",
		identifier: "dev.ghoaxtwriter.app",
		version: "0.0.1",
	},
	build: {
		mainProcess: "cottontail",
		cottontail: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: true,
			defaultRenderer: "cef",
			chromiumFlags: {
				"disable-gpu": true,
			},
			icon: "assets/icon.png",
    		flatpak: {
      			enabled: true,
      			outputPath: "flatpak",
			},
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
