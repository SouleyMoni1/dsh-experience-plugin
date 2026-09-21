/**
 * daily-optimization —— 设置页「日用优化」分区文案（zh / en 双语）。
 * 命名空间合并进 LocaleNamespaceMap，让 register/bind 获得类型化键。
 */

/** 本分区文案键（字符串字面量联合）。 */
export type DailyOptimizationLocaleKey =
  | 'nav' | 'title' | 'intro'
  | 'settingsTab' | 'modulesTab' | 'modulesIntro' | 'settingsEmpty'
  | 'mcpTab' | 'skillsTab'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 日用优化设置分区文案。 */
    'daily-optimization': DailyOptimizationLocaleKey
  }
}

/** 中文文案。 */
export const zh: Record<DailyOptimizationLocaleKey, string> = {
  nav: '日用优化',
  title: '日用优化',
  intro: '集中管理体验插件的日常设置与功能开关。',
  settingsTab: '插件设置',
  modulesTab: '模块开关',
  mcpTab: 'MCP 管理',
  skillsTab: 'Skills 管理',
  modulesIntro: '按需启用/停用各功能模块（默认全部开启）',
  settingsEmpty: '全部功能模块已关闭，可在「模块开关」页签重新开启。',
}

/** 英文文案。 */
export const en: Record<DailyOptimizationLocaleKey, string> = {
  nav: 'Daily Optimization',
  title: 'Daily Optimization',
  intro: 'Manage the experience plugin\'s daily settings and feature toggles in one place.',
  settingsTab: 'Plugin Settings',
  modulesTab: 'Module Toggles',
  mcpTab: 'MCP',
  skillsTab: 'Skills',
  modulesIntro: 'Enable or disable each feature module (all on by default)',
  settingsEmpty: 'All feature modules are off; re-enable them in the Module Toggles tab.',
}
