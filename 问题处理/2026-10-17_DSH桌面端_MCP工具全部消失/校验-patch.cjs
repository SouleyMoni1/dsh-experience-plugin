// 校验恢复后的 patch：YAML 可解析（含 !!js 标签）+ MCP 条目齐全。
const fs = require('fs')
const { parse } = require('F:/EdenOS/AI/dsh-experience-plugin/node_modules/yaml')

const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (v) => v,
  stringify: (v) => String(v),
}

const file = 'C:/Users/zihao.chen/.dsh/profiles/desktop/cordis.patch.yml'
const rows = parse(fs.readFileSync(file, 'utf8'), { customTags: [JS_TAG] })

console.log('顶层条目 %d 个:', rows.length)
for (const r of rows) console.log('  - id:', r.id ?? `(insert ${r.insert?.length ?? 0} 条)`)

const mcp = []
for (const r of rows) for (const it of r.insert ?? []) if (it.name === '@deepseek-ai/dsh-mcp-client') mcp.push(it)
console.log('\nmcp-client 条目 %d 个:', mcp.length)
for (const m of mcp) console.log('  %s -> serverName=%s transport=%s cmd=%s', m.id, m.config.serverName, m.config.transport, m.config.command)
