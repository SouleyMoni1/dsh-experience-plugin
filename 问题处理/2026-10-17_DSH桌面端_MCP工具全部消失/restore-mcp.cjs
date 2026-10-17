// 把 10-15 备份里的 MCP insert 块补回当前 profile patch。
// 只追加该块，不改动现有条目的取值；写入前备份，保持 UTF-8 无 BOM + LF。
const fs = require('fs')

const P = 'C:/Users/zihao.chen/.dsh/profiles/desktop'
const cur = `${P}/cordis.patch.yml`
const src = `${P}/cordis.patch.yml.bak-1792220412492`

const curText = fs.readFileSync(cur, 'utf8')
const srcLines = fs.readFileSync(src, 'utf8').split('\n')

// 1-based 146..205 是 `- insert:` 块
const block = srcLines.slice(145, 205).join('\n')
if (!block.startsWith('- insert:')) throw new Error('块起点不符: ' + JSON.stringify(block.slice(0, 40)))
if (!/toolCallTimeoutMs: 120000$/.test(block.trimEnd())) throw new Error('块终点不符: ' + JSON.stringify(block.slice(-70)))
if (!block.includes("serverName: fastctx")) throw new Error('块内容不符')

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const bakPath = `${cur}.bak-pre-mcp-restore-${stamp}`
fs.copyFileSync(cur, bakPath)

const merged = curText.replace(/\n*$/, '\n') + '\n' + block + '\n'
if (merged.includes('\r')) throw new Error('出现 CR')
fs.writeFileSync(cur, Buffer.from(merged, 'utf8'))

console.log('备份 ->', bakPath.split('/').pop())
console.log('新文件 %d 行 / %d 字节', merged.split('\n').length - 1, Buffer.byteLength(merged))
