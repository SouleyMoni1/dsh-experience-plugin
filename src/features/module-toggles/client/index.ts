/**
 * module-toggles —— browser 半区：每个功能模块的独立启停开关。
 *
 * 插件目前有 6 个功能模块，其中纯 client 模块（时间轴 / 折叠 / 设置页全屏化）
 * 随插件自动启用、没有配置开关；host 模块（模型思考等级 / CLI 模拟 / 打开文件夹）
 * 的 enabled 在插件配置里。本模块在设置页「日用优化」分区提供「模块开关」页签，
 * 列出全部模块，每个一个开关，状态持久化在 localStorage：
 *  - 关闭某模块 → 该模块的浏览器侧功能不再装配（时间轴不显示、折叠不生效、
 *    设置页保持弹窗、配置卡片不注册等）；
 *  - 默认全部开启，与旧行为一致。
 *
 * 装配侧（src/client/index.ts）通过 isModuleEnabled(id) 决定是否 apply 各模块。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 模块清单：id 与展示信息（开关卡片用）。 */
export interface ModuleInfo {
  id: string
  label: string
  description: string
}

export const MODULES: ModuleInfo[] = [
  { id: 'model-reasoning', label: '模型思考等级', description: '为自定义 API 模型注入推理等级' },
  { id: 'cli-mimic', label: 'CLI 请求模拟', description: '把 DSH 模型请求伪装成 CLI 客户端' },
  { id: 'open-folder', label: '打开文件夹', description: '工作区行菜单打开项目目录' },
  { id: 'timeline-rail', label: '消息时间轴', description: '对话页左侧消息标记条 + 预览' },
  { id: 'msg-collapse', label: '消息折叠', description: '工作过程折叠横条，一键收起/展开' },
  { id: 'auto-load-history', label: '自动加载历史', description: '自动加载更早的对话历史' },
  { id: 'settings-page', label: '设置页全屏化', description: '设置弹窗改全屏页 + 背景不透明开关' },
  { id: 'my-rules', label: '全局指令', description: '编辑此主机全局指令（~/.dsh/AGENTS.md）' },
]

/**
 * 按「开启优先、再按清单顺序」排序模块 id 列表。
 * 设置卡片与模块开关共用此规则，保证两处排序一致；开关变化时父级重渲染即自动刷新顺序。
 * @param ids - 待排序的模块 id 列表。
 * @param states - 各模块开关状态（id → 是否开启）。
 * @returns 排序后的 id 列表。
 */
export function sortModuleIds(ids: string[], states: Record<string, boolean>): string[] {
  const order = new Map(MODULES.map((m, i) => [m.id, i]))
  return [...ids].sort((a, b) => {
    const aOn = states[a] ?? true
    const bOn = states[b] ?? true
    if (aOn !== bOn) return aOn ? -1 : 1
    return (order.get(a) ?? 0) - (order.get(b) ?? 0)
  })
}

/** localStorage key 前缀。 */
const KEY_PREFIX = 'dsh-experience:module:'

/** 读取某模块开关（缺省 = 开启，与旧行为一致）。 */
export function isModuleEnabled(id: string): boolean {
  if (typeof localStorage === 'undefined') return true
  const stored = localStorage.getItem(KEY_PREFIX + id)
  if (stored === null) return true
  return stored === '1'
}

/** 写入某模块开关。 */
export function setModuleEnabled(id: string, on: boolean): void {
  try {
    localStorage.setItem(KEY_PREFIX + id, on ? '1' : '0')
  } catch {
    // localStorage 不可用时仅本次会话生效，忽略
  }
}

/**
 * 浏览器侧装配「模块开关」。
 * 开关列表渲染在设置页「日用优化」分区的「模块开关」页签
 * （src/features/daily-optimization/client/DailyOptimizationSection.tsx），
 * 由 src/client/index.ts 统一装配；本函数保留 ctx 参数以符合各模块 apply 签名惯例。
 * @param ctx - client 根上下文。
 */
export function applyModuleToggles(_ctx: ClientContext): void {
  // 列表渲染在日用优化分区，这里不重复注册，避免重复渲染。
}
