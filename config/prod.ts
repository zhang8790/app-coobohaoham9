import type { UserConfigExport } from "@tarojs/cli";
import { patchTaroAppConfig } from "miaoda-sc-plugin";

const base = String(process.argv[process.argv.length - 1]);
const publicPath = base.startsWith("http") ? base : "/";

export default {
	defineConstants: {
		'process.env.TARO_APP_LOCAL_DEV': JSON.stringify(process.env.TARO_APP_LOCAL_DEV || 'false'),
		'process.env.TARO_APP_SUPABASE_URL': JSON.stringify(process.env.TARO_APP_SUPABASE_URL || ''),
		'process.env.TARO_APP_SUPABASE_ANON_KEY': JSON.stringify(process.env.TARO_APP_SUPABASE_ANON_KEY || ''),
		'process.env.TARO_APP_APP_ID': JSON.stringify(process.env.TARO_APP_APP_ID || ''),
	},
	mini: {},
	h5: {},
	compiler: {
		type: "vite",
		vitePlugins: [patchTaroAppConfig(publicPath)],
	},
} satisfies UserConfigExport<"vite">;
