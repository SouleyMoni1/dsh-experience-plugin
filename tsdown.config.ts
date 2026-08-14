import { defineConfig } from 'tsdown'

/**
 * dsh 插件包构建配置：
 *  - node 半区 -> lib/index.js（esm，host 进程加载）
 *  - client 半区 -> lib/client.js（cjs，带 __ModuleLoader__.load 包裹，
 *    由浏览器端 dsh 客户端模块系统按 dsh.client 声明加载）
 */
const PLUGIN_ID = 'dsh-hello-plugin'

export default defineConfig([
  {
    // Node/host 半区
    name: PLUGIN_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    // 保持 .js 扩展名（与 package.json 的 main/exports 一致；官方 SDK 包同样如此）
    fixedExtension: false,
    dts: false,
    // clean 必须关闭：tsc -b 先产出 lib/types/*.d.ts，clean 会把它一并清掉
    clean: false,
  },
  {
    // Browser/client 半区：类型由 tsc 输出到 lib/types，这里只产 JS。
    // 打包时依赖自动外部化；本示例 client 半区无运行时依赖。
    name: PLUGIN_ID + '/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    clean: false,
    // client 半区运行时依赖由浏览器 ModuleLoader 提供（react + 官方 @deepseek-ai/* 包），
    // 全部外部化，保持与官方 client 包一致的 require 形态。
    deps: {
      neverBundle: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', /^@deepseek-ai\//],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])