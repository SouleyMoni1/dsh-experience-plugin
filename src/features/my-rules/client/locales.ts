/**
 * my-rules 设置卡片 —— 文案（zh / en 双语）。
 * 命名空间合并进 LocaleNamespaceMap，让 register/bind 获得类型化键。
 */

/** 本卡片文案键（字符串字面量联合）。 */
export type MyRulesLocaleKey =
  | 'nav' | 'title' | 'cardDescription' | 'hint' | 'learnMore'
  | 'editorNote' | 'placeholder' | 'save' | 'saving' | 'saved'
  | 'savedWarn' | 'removed' | 'saveFailed' | 'loading' | 'loadFailed'
  | 'confirmRemove' | 'bytes' | 'budget' | 'meter' | 'cancel'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** my-rules 全局指令卡片文案。 */
    'my-rules': MyRulesLocaleKey
  }
}

/** 中文文案。 */
export const zh: Record<MyRulesLocaleKey, string> = {
  nav: '全局指令',
  title: '全局指令',
  cardDescription: '编辑此主机的全局指令（~/.dsh/AGENTS.md），作用于所有聊天',
  hint: '向 DSH 提供适用于此主机上所有聊天的额外说明和上下文。',
  learnMore: '了解更多',
  editorNote: '写入 {path} · Markdown 格式 · 新会话立即生效；当前会话在下次文件操作后感知新指令。',
  placeholder: '在此输入你的自定义指令…（可多条，换行分隔）',
  save: '保存',
  saving: '保存中…',
  saved: '已保存 — 新会话立即生效。',
  savedWarn: '已保存（内容超过 64 KB 预算，超出部分可能被指令渲染器省略）。',
  removed: '已清除全局指令。',
  saveFailed: '保存失败: ',
  loadFailed: '加载失败: ',
  loading: '加载中…',
  confirmRemove: '内容为空 — 保存将删除全局指令文件（$DSH_HOME/AGENTS.md），所有会话将不再加载你的自定义指令。确定删除吗？',
  bytes: '{n} 字节',
  budget: '预算 {budget} KB',
  meter: '{pct}% / 预算 {budget} KB',
  cancel: '取消',
}

/** 英文文案。 */
export const en: Record<MyRulesLocaleKey, string> = {
  nav: 'My Rules',
  title: 'My Rules',
  cardDescription: 'Edit this host\'s global instructions (written to $DSH_HOME/AGENTS.md, applies to every chat)',
  hint: 'Additional instructions and context for every chat on this host.',
  learnMore: 'Learn more',
  editorNote: 'Written to {path} · Markdown · new sessions apply immediately; the current session picks it up after the next file operation.',
  placeholder: 'Type your custom instructions here… (one per line)',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved — new sessions apply immediately.',
  savedWarn: 'Saved (content exceeds the 64 KB budget; overflow may be omitted by the instruction renderer).',
  removed: 'Global instructions removed.',
  saveFailed: 'Save failed: ',
  loadFailed: 'Load failed: ',
  loading: 'Loading…',
  confirmRemove: 'The content is empty — saving will delete the global instructions file ($DSH_HOME/AGENTS.md) and your custom instructions will no longer load in any session. Delete?',
  bytes: '{n} bytes',
  budget: 'budget {budget} KB',
  meter: '{pct}% / budget {budget} KB',
  cancel: 'Cancel',
}
