#!/usr/bin/env node
/**
 * profile-sync —— 把 dsh-experience-plugin 幂等地挂进 / 摘出 DSH profile 组合。
 *
 * 为什么不让 AI 在会话里直接改：运行中的 DSH 正是通过 profile 组合启动的，
 * 边跑边改线上组合（package.json + pnpm install）会动到自己脚下的 node_modules。
 * 所以这里只做两件确定性的事——改 profile 的 package.json、打印下一步命令，
 * 由主人在外部终端执行。
 *
 * 用法：
 *   node scripts/profile-sync.mjs status     # 只看当前状态（默认）
 *   node scripts/profile-sync.mjs apply      # 挂上插件（依赖 + bundles）
 *   node scripts/profile-sync.mjs rollback   # 摘掉插件，恢复原样
 *
 * profile 目录默认 %USERPROFILE%\.dsh\profiles\web，可用 DSH_PROFILE_DIR 覆盖。
 * 两种模式都幂等：已处于目标状态时不写文件。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PLUGIN = 'dsh-experience-plugin'
const mode = process.argv[2] ?? 'status'

if (!['status', 'apply', 'rollback'].includes(mode)) {
  console.error(`未知模式 ${JSON.stringify(mode)}：可用 status / apply / rollback`)
  process.exit(2)
}

const profileDir = process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'web')
const pkgPath = join(profileDir, 'package.json')
const backupPath = `${pkgPath}.bak-profile-sync`

// 插件走 ~/.dsh/plugins 下的 junction（Windows 跨盘符软链），profile 里引用 link: 规格。
const linkTarget = join(homedir(), '.dsh', 'plugins', PLUGIN)
const linkSpec = `link:${linkTarget.replace(/\\/g, '/')}`

if (!existsSync(pkgPath)) {
  console.error(`找不到 profile package.json：${pkgPath}`)
  process.exit(2)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.dependencies ??= {}
pkg.dsh ??= {}
pkg.dsh.profile ??= {}
pkg.dsh.profile.bundles ??= []

const depNow = pkg.dependencies[PLUGIN]
const inBundles = pkg.dsh.profile.bundles.includes(PLUGIN)

if (mode === 'status') {
  console.log(`profile      : ${profileDir}`)
  console.log(`dependency   : ${depNow ?? '(缺失)'}`)
  console.log(`bundles 条目 : ${inBundles ? '有' : '(缺失)'}`)
  console.log(`link 规格    : ${linkSpec}`)
  console.log(`junction     : ${existsSync(linkTarget) ? '存在' : '(缺失)'}`)
  const ok = depNow === linkSpec && inBundles
  console.log(`状态         : ${ok ? '已正确挂载' : '未挂载（跑 apply 修复）'}`)
  process.exit(ok ? 0 : 1)
}

const changes = []

if (mode === 'apply') {
  if (!existsSync(linkTarget)) {
    console.error(`junction 缺失：${linkTarget}`)
    console.error('先建链接再跑本脚本：')
    console.error(`  New-Item -ItemType Junction -Path "${linkTarget}" -Target "F:\\EdenOS\\AI\\dsh-experience-plugin"`)
    process.exit(2)
  }
  if (depNow !== linkSpec) {
    pkg.dependencies[PLUGIN] = linkSpec
    changes.push(`dependency: ${depNow ?? '(缺失)'} -> ${linkSpec}`)
  }
  if (!inBundles) {
    pkg.dsh.profile.bundles.push(PLUGIN)
    changes.push(`bundles: 追加 ${PLUGIN}`)
  }
} else {
  if (depNow !== undefined) {
    delete pkg.dependencies[PLUGIN]
    changes.push(`dependency: 移除 ${PLUGIN}`)
  }
  if (inBundles) {
    pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((name) => name !== PLUGIN)
    changes.push(`bundles: 移除 ${PLUGIN}`)
  }
}

if (changes.length === 0) {
  console.log(`${mode}: 已是目标状态，未改动 ${pkgPath}`)
  process.exit(0)
}

if (!existsSync(backupPath)) {
  copyFileSync(pkgPath, backupPath)
  console.log(`已备份原始文件 -> ${backupPath}`)
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
console.log(`${mode}: 已更新 ${pkgPath}`)
for (const line of changes) console.log(`  - ${line}`)
console.log('下一步：在外部终端跑 pnpm install（或 `dsh plugin --profile web install`），然后重启 DSH Web。')
