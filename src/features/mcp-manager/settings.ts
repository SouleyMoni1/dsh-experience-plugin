/**
 * mcp-manager 的 settings 命名空间 —— 托管 MCP 服务器注册表。
 *
 * dsh 原生加载 MCP 的方式是 @deepseek-ai/dsh-mcp-client 的插件实例（cordis.yml
 * 里每个服务器一个实例）。本模块不直接改 cordis.yml，而是维护一个自己的注册表
 * （此命名空间），host 侧把 enabled 的服务器动态装配成 mcp-client 子插件：
 *   - 新增/导入/开关都写这里（RPC 端点）→ settings 变更 → host 自动对账；
 *   - 关闭的服务器保留配置但不再装配（启用时可无损恢复）。
 *
 * schema 默认值 = 空注册表；用户保存后 user 层接管。
 */
import z from '@deepseek-ai/schemastery'

/** mcp-manager 配置命名空间（kebab-case，符合 settingsNamespace 的命名规则）。 */
export const MCP_MANAGER_NS = 'dsh-experience-mcp-manager'

/** 单个托管 MCP 服务器的注册表条目。 */
export interface ManagedMcpServer {
  /** 模型侧工具命名空间（mcp__<name>__<tool>），须唯一、kebab 风格。 */
  name: string
  /** 传输方式：stdio（子进程）或 streamable-http（远程 URL）。 */
  transport: 'stdio' | 'streamable-http'
  /** 是否启用（启用才会被 host 装配成 mcp-client 子插件）。 */
  enabled: boolean
  /** stdio 可执行文件（transport=stdio 必填）。 */
  command: string
  /** stdio 参数。 */
  args: string[]
  /** stdio 额外环境变量。 */
  env: Record<string, string>
  /** stdio 子进程工作目录（空 = 继承宿主 cwd）。 */
  cwd: string
  /** streamable-http 端点 URL（transport=streamable-http 必填）。 */
  url: string
  /** streamable-http 请求头（如认证 token）。 */
  headers: Record<string, string>
}

/** 命名空间整体 schema。 */
export const McpManagerSettingsSchema = z.object({
  servers: z.array(
    z.object({
      name: z.string(),
      transport: z.union([z.const('stdio'), z.const('streamable-http')]).default('stdio'),
      enabled: z.boolean().default(true),
      command: z.string().default(''),
      args: z.array(z.string()).default([]),
      env: z.dict(z.string()).default({}),
      cwd: z.string().default(''),
      url: z.string().default(''),
      headers: z.dict(z.string()).default({}),
    }),
  ),
}).default({ servers: [] }) as unknown as z<McpManagerSettings>

/**
 * 插件 Config 上的 `mcpManager` 段（工厂，每次返回新实例）。
 *
 * 用工厂而非共享常量：`.volatile()` 是**原地**修改，重复调用会抛
 * `volatile schema is already wrapped`；而稳定线注册用的 schema 必须不带标记，
 * 共享实例会让两线互相污染。
 * @returns 带 volatile 标记的段 schema。
 */
export function mcpManagerSection(): z<McpManagerSettings> {
  return McpManagerSettingsSchema.volatile() as unknown as z<McpManagerSettings>
}

/** 命名空间解析后的值类型。 */
export interface McpManagerSettings {
  servers: ManagedMcpServer[]
}
