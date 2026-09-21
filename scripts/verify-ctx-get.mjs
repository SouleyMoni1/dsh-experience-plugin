#!/usr/bin/env node
/**
 * verify-ctx-get.mjs —— 验证 cordis 的 ctx.get(name) 在「未 inject」时能否拿到服务。
 *
 * 为什么必须验证：mcp-manager 用 ctx.get('loader') 读已安装的 MCP 条目，而本插件的
 * inject 列表里没有 'loader'。若 cordis 对未 inject 的服务返回 undefined，修复就静默失效
 * （卡片永远显示 0 个已安装）。这里用 profile 里真实的 cordis 复现一次。
 */
import { Context } from '@deepseek-ai/cordis'

const root = new Context()
const fiber = root.plugin({
  name: 'probe',
  apply(ctx) {
    // 在根上提供一个服务，再从「没有 inject 它」的子插件里读。
    root.provide('loader', { entries: () => ['fake-entry'] })
    const got = ctx.get('loader')
    const missing = ctx.get('nonexistent-service')
    console.log('未 inject 时 ctx.get(已提供):', got === undefined ? 'undefined（修复会失效）' : 'OK')
    console.log('未 inject 时 ctx.get(不存在):', missing === undefined ? 'undefined（预期）' : 'unexpected')
    console.log('通过 get 调用:', got?.entries?.())
    process.exit(got === undefined ? 1 : 0)
  },
})
void fiber
