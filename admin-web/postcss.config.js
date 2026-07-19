// admin-web 独立 PostCSS 配置。
// 作用：阻止 Vite 向上找到根目录的 postcss.config.js（含 tailwindcss 插件），
// 从而消除开发时 "The `content` option in your Tailwind CSS configuration is missing or empty" 误报。
// admin-web 完全不使用 Tailwind（页面用内联 style + 纯 CSS），只需 autoprefixer 处理兼容性前缀。
module.exports = {
  plugins: {
    autoprefixer: {},
  },
}
