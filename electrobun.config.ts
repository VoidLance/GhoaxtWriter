import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "GhoaxtWriter",
		identifier: "dev.ghoaxtwriter.app",
		version: "1.0.0",
		description: "A distraction-free, novel-first writing app with a live Markdown editor, planning tools and manuscript import/export.",
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
			icons: "assets/icon.iconset",
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
				finishArgs: [
					"--share=ipc",
					"--share=network",
					"--socket=wayland",
					"--socket=x11",
					"--socket=pulseaudio",
					"--device=dri",
					"--filesystem=home",
				],
			},
		},
		win: {
			bundleCEF: false,
			icon: "assets/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
