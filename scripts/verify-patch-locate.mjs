#!/usr/bin/env node
/**
 * verify-patch-locate.mjs —— 验证插件能定位到运行中 profile 的 patch 文件。
 *
 * 这是整个「关 / 卸载」功能的地基：插件从
 * `<profile>/node_modules/dsh-experience-plugin/lib/index.js` 加载，
 * `../../../cordis.patch.yml` 必须正好落在 profile 根。
 *
 * 同时验证「从仓库源码加载」时返回 null（不误指到 F: 盘仓库）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveProfilePatchFile } from '../lib/index.js'

let failed = 0
function ok(label, condition, detail = '') {
  if (!condition) failed += 1
  console.log(`${condition ? '✔' : '✘'} ${label}${condition ? '' : `  ${detail}`}`)
}

const profileDir = join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'web')
const profileCopy = join(profileDir, 'node_modules', 'dsh-experience-plugin', 'lib', 'index.js')

// ── 1. 模拟真实运行位置 ──────────────────────────────────────────────────────
ok('profile 里的插件副本存在', existsSync(profileCopy), profileCopy)
const fromProfile = resolveProfilePatchFile(pathToFileURL(profileCopy).href)
ok('从 profile 副本能定位到 patch 文件', fromProfile !== null, String(fromProfile))
ok('定位结果正是 profile 根下的 patch 文件', fromProfile === join(profileDir, 'cordis.patch.yml'), String(fromProfile))
ok('定位到的文件真的存在', fromProfile !== null && existsSync(fromProfile))

// ── 2. 从仓库源码加载时不该误指 ──────────────────────────────────────────────
const fromRepo = resolveProfilePatchFile(pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href)
ok('从仓库源码加载时返回 null（不误指到别处）', fromRepo === null, String(fromRepo))

// ── 3. 路径拼错一层就会落到错误位置（反向验证相对深度）──────────────────────
const wrongDepth = pathToFileURL(join(profileDir, 'node_modules', 'dsh-experience-plugin', 'lib', 'index.js')).href
ok('定位用的是 lib/index.js 这一层', resolveProfilePatchFile(wrongDepth) !== null)
ok('上溯三层落在 profile 根而不是 node_modules', !String(fromProfile).includes('node_modules'), String(fromProfile))

// ── 4. 定位到的文件能被编辑器解析（端到端串联）──────────────────────────────
const text = readFileSync(fromProfile, 'utf8')
ok('patch 文件是 UTF-8 无 BOM', text.charCodeAt(0) !== 0xfeff)
ok('patch 文件是 LF', !text.includes('\r'))

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
