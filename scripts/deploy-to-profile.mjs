#!/usr/bin/env node
/**
 * deploy-to-profile —— 把本仓库的构建产物同步进 DSH profile 的插件安装副本。
 *
 * 为什么需要它：profile 的 package.json 用 `^0.7.1` 引用本插件，pnpm 装出来的
 * 是**独立副本**（硬链接到 pnpm store），不是指向本仓库的 junction。运行中的
 * DSH 读的就是那份副本——只 build 不 deploy，改的代码永远不会生效。
 *
 * 用法：
 *   node scripts/deploy-to-profile.mjs           # 同步 lib/*.js（默认）
 *   node scripts/deploy-to-profile.mjs --dry     # 只看差异，不写
 *
 * 安全：写入前把原文件备份为 <name>.bak-deploy-<时间戳>；先删后拷以断开硬链接，
 * 避免直接覆盖污染 pnpm store 里的共享块。
 *
 * profile 目录默认 %USERPROFILE%\.dsh\profiles\web，可用 DSH_PROFILE_DIR 覆盖。
 */
import { readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

const PLUGIN = 'dsh-experience-plugin'
const dry = process.argv.includes('--dry')

const repoRoot = join(import.meta.dirname, '..')
const srcDir = join(repoRoot, 'lib')
const profileDir = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'web')
const dstDir = join(profileDir, 'node_modules', PLUGIN, 'lib')

if (!existsSync(srcDir)) {
  console.error(`构建产物缺失：${srcDir}\n先跑 pnpm build`)
  process.exit(2)
}
if (!existsSync(dstDir)) {
  console.error(`profile 里没有本插件：${dstDir}\n先跑 node scripts/profile-sync.mjs apply 并 pnpm install`)
  process.exit(2)
}

/** 文件内容哈希（不存在时为空串）。 */
const hashOf = (path) => existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : ''

const files = ['index.js', 'client.js']
// YYYYMMDDHHMMSS：ISO 串去掉 -:T 后第 15 个字符是毫秒前的小数点，必须排除。
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
let changed = 0

for (const name of files) {
  const src = join(srcDir, name)
  const dst = join(dstDir, name)
  if (!existsSync(src)) {
    console.error(`源产物缺失，跳过：${src}`)
    continue
  }
  if (hashOf(src) === hashOf(dst)) {
    console.log(`= ${name} 已是最新`)
    continue
  }
  if (dry) {
    console.log(`~ ${name} 有差异（--dry，未写入）`)
    changed += 1
    continue
  }
  if (existsSync(dst)) {
    const backup = `${dst}.bak-deploy-${stamp}`
    copyFileSync(dst, backup)
    // 先删后拷：直接覆盖会写进 pnpm store 的硬链接块，污染其他 profile。
    rmSync(dst, { force: true })
    console.log(`  ${name} 已备份 -> ${basename(backup)}`)
  }
  copyFileSync(src, dst)
  console.log(`✔ ${name} 已更新`)
  changed += 1
}

if (changed === 0) {
  console.log('\n无需同步。')
  process.exit(0)
}
if (dry) {
  console.log(`\n${changed} 个文件有差异（dry-run，未写入）。`)
  process.exit(0)
}
console.log(`\n同步完成（${changed} 个文件）。`)
console.log('注意：host 半区（index.js）需要重启 DSH Web 才会生效；client 半区刷新页面即可。')
