# AI Commit 可视化多渠道配置中心设计

日期：2026-08-02  
状态：已获用户批准，可进入实施  
实施约束：未经用户明确指令，不执行任何 Git 命令，不提交、不切分支、不操作远端

## 1. 背景

当前扩展依赖 VS Code 原生 Settings 暴露 17 个大写配置项。不同服务商的 Key、Base URL、模型和高级参数混排，用户很难判断：

- 当前真正启用的是哪个服务商、哪个 Base URL、哪个模型和哪个 Key。
- 自己曾经添加过哪些渠道配置。
- 切换服务商后，原配置是否仍然保留。
- API Key 是否安全、是否会被 Settings Sync 或工作区文件泄露。

本次改造以“配置体验做加法”为原则。现有提交生成主链路，包括暂存区 diff、默认 Prompt、SCM 输入框附加上下文、模型调用结果清理以及写回 SCM 输入框的行为，保持不变。

## 2. 目标

1. 提供原生、轻量、跟随 VS Code 主题的可视化配置中心。
2. 第一版重点管理 OpenAI 与 Anthropic 渠道，两者均支持自定义 Base URL。
3. 同一服务商允许保存多套命名渠道配置，并能清楚查看、测试、编辑、启用和删除。
4. 页面固定显示当前真正生效的渠道，包括服务商、配置名称、完整 Base URL、模型以及 Key 备注和末四位。
5. 完整 API Key 使用 VS Code `SecretStorage` 保存，不写入 `settings.json`，不发送到 Webview，不记录到日志。
6. 渠道元数据随 VS Code Settings Sync 同步；用户可选择使用一个同步密码端到端加密全部 Key，使新设备只需解锁一次。
7. 渠道列表全局共享，每个工作区可以选择不同的当前渠道。
8. 旧 OpenAI 与 Claude 设置可事务式迁移为命名渠道；成功写入 SecretStorage 后才清除旧明文 Key。
9. UI 跟随 VS Code 语言，第一版提供简体中文和英文。
10. 保持扩展轻量：按需激活、无前端框架、无后台轮询、Webview 关闭即释放。
11. 生成可本地安装的 VSIX，并用自动化测试和实际安装验证改造结果。

## 3. 非目标

- 不修改默认提交 Prompt 内容或现有自定义 Prompt 的替换语义。
- 不改变暂存区 diff 的来源、SCM 输入框附加上下文或生成结果写回方式。
- 不在第一版引入 React、Vue、数据库、后台服务或自建账号系统。
- 不在第一版公开发布到 Marketplace；发布、重命名和 Publisher 调整需用户另行授权。
- 不把明文 Key 放入 VS Code Settings Sync。
- 不自动保存每一次被替换的旧 Key；只有用户主动创建的命名渠道才会保留。
- 不主动执行任何 Git 操作。

## 4. 兼容性边界

### 4.1 保持不变

以下行为视为回归边界，实施后必须通过测试证明没有改变：

1. 从当前仓库读取 staged diff。
2. SCM 提交输入框中已有文字作为附加上下文。
3. 默认 Prompt 内容和输出格式要求。
4. 自定义 Prompt 非空时替换默认 Prompt的现有语义。
5. OpenAI Chat Completions 与 Responses API 的生成行为。
6. Anthropic 的消息构造与生成结果读取方式。
7. 清除 `<think>...</think>` 内容后写回 SCM 输入框。
8. 原有错误经命令包装器显示 Retry / Configure 的主交互。

### 4.2 新增的最小接入点

生成命令在进入服务商 API 调用前，新增一次“解析当前工作区生效渠道”的步骤。该步骤只返回：

- provider
- baseUrl
- apiKey
- model
- provider-specific options

随后仍把原有 messages 交给对应服务商客户端。Prompt 构造与 diff 处理不依赖配置中心。

### 4.3 旧 Gemini 行为

本次配置中心只提供 OpenAI 与 Anthropic 的新渠道管理。为满足“只做加法、生成逻辑不回退”的约束，第一阶段不主动删除旧 Gemini 代码和旧 Settings：

- 已有 Gemini 用户仍可通过旧设置使用原路径。
- 新配置中心不创建新的 Gemini 渠道。
- 当工作区选择了新 Profile 时，以新 Profile 为准。
- 未选择新 Profile 且旧 `AI_PROVIDER=gemini` 时，继续走旧 Gemini 分支。

后续是否彻底移除 Gemini，需单独确认并作为破坏性变更处理。

## 5. 用户体验设计

### 5.1 入口与激活

- 不使用 `onStartupFinished`，不在安装后自动激活。
- 用户第一次执行 AI Commit 且没有可用生效渠道时，自动打开配置中心。
- 配置完成后，日常执行 AI Commit 直接生成，不创建 Webview。
- 命令面板提供“AI Commit: 打开配置中心”。
- Source Control 标题区保留生成按钮，并增加配置入口或在生成错误提示中提供配置入口。

### 5.2 页面结构

采用“左侧导航 + 右侧内容”的双栏结构：

- 左侧：OpenAI、Anthropic、通用设置、自定义提示词。
- 服务商旁显示渠道数量和该服务商是否包含当前生效渠道。
- 右侧：所选服务商的渠道列表，或单个渠道的新增/编辑表单。
- 页面顶部固定显示“当前生效配置”摘要。

### 5.3 当前生效配置摘要

固定显示：

- 服务商，例如 OpenAI。
- 配置名称，例如 DeepSeek 个人。
- 完整 Base URL。
- 模型。
- Key 备注与末四位，例如 `个人 DeepSeek · sk-••••2A9F`。
- 最近一次连接测试状态和耗时。

“正在查看”与“当前生效”是两个独立状态。打开或编辑 Anthropic 页面不会改变当前 OpenAI 渠道。只有成功执行“保存并启用”才会切换。

### 5.4 渠道列表

每条渠道显示：

- 配置名称。
- 完整 Base URL。
- 模型。
- Key 备注和掩码末四位。
- 当前状态：生效、已配置、缺少本机 Key、未测试、测试失败或连接正常。
- 最近测试时间和耗时。
- 操作：启用、测试、编辑、删除。

同一服务商可保存多条渠道，例如：

- OpenAI 官方。
- DeepSeek 个人。
- 公司 OpenAI 兼容网关。
- Anthropic 官方。
- 公司 Anthropic 兼容网关。

### 5.5 新增与编辑

通用字段：

- 配置名称，必填，同一服务商内不可重复。
- Base URL，必填，可恢复服务商默认值。
- API Key，新增时必填，编辑时允许保持原值。
- Key 备注，选填；未填写时由服务商和末四位生成安全显示名。
- 模型，必填。

模型选择支持：

- 点击“获取模型”后从渠道读取模型列表。
- 渠道不支持模型列表或请求失败时，允许手动输入。
- 获取模型只在用户主动点击时发起，不后台轮询。

OpenAI 高级设置保留现有 API 类型、Temperature、Responses API 推理强度和输出详细程度。Anthropic 高级设置保留 Temperature，并增加自定义 Base URL。

### 5.6 保存、测试与启用

- “保存”允许把未测试配置作为草稿保存。
- “保存并启用”在配置新建或关键字段变更后自动测试连接。
- 测试失败时保存草稿，但不改变当前生效渠道。
- 原生测试按钮允许随时重新测试。
- 启用渠道要求当前设备已拥有对应完整 Key。
- 正在生效的渠道不能直接删除，必须先切换到其他渠道。
- 删除必须二次确认；删除 Profile 时同步删除对应本机 SecretStorage Key，并更新加密密钥包。

### 5.7 通用设置与 Prompt

配置中心可以编辑提交语言和自定义 Prompt，但底层仍使用现有 VS Code 配置键，以保持兼容和 Settings Sync 行为。

- 自定义 Prompt 默认收起在高级区域。
- 不改变现有语义：非空自定义 Prompt 替换默认 Prompt。
- 页面明确提示“填写后将替换内置提交规范”。
- 多行文本使用 Webview textarea，解决原生单行 Settings 的可用性问题。

## 6. 数据模型

### 6.1 Profile 元数据

```ts
type ProviderType = 'openai' | 'anthropic';

interface ChannelProfile {
  id: string;
  provider: ProviderType;
  name: string;
  baseUrl: string;
  model: string;
  keyLabel?: string;
  keyHint: string;
  createdAt: number;
  updatedAt: number;
  lastTest?: {
    status: 'success' | 'failure';
    testedAt: number;
    latencyMs?: number;
    message?: string;
  };
  options: OpenAIProfileOptions | AnthropicProfileOptions;
}
```

`keyHint` 只允许包含安全前缀和末四位，不包含可还原的完整 Key。

### 6.2 ProfileCatalog

```ts
interface ProfileCatalog {
  schemaVersion: 1;
  revision: number;
  profiles: ChannelProfile[];
  defaultProfileId?: string;
  encryptedSyncEnabled: boolean;
  vaultRevision?: number;
}
```

ProfileCatalog 保存在 `ExtensionContext.globalState`，并通过 `globalState.setKeysForSync(...)` 注册为可同步状态。

### 6.3 工作区选择

当前工作区选择的 Profile ID 保存在 `workspaceState`：

```ts
interface WorkspaceProfileSelection {
  activeProfileId?: string;
}
```

解析优先级：

1. 当前工作区 activeProfileId，且该 Profile 存在并在本机拥有 Key。
2. 全局 defaultProfileId，且可用。
3. 不自动选择其他 Profile，打开配置中心要求用户确认，避免误用公司或个人 Key。

### 6.4 SecretStorage 键

- `aiCommit.profile.<profileId>.apiKey`：该渠道完整 API Key。
- `aiCommit.sync.masterPassword`：本机保存的同步密码，只有用户选择“在此设备记住”时写入。
- `aiCommit.sync.lastAppliedVaultRevision`：本机最后成功导入的密钥包版本。

Webview 不直接访问 SecretStorage。所有读取、写入、删除和掩码计算都在 Extension Host 完成。

## 7. 端到端加密 Key 同步

### 7.1 原则

- 功能必须由用户明确开启，不默认上传任何密钥密文。
- Settings Sync 只同步密文、盐、nonce、认证标签、版本号和非敏感 Profile ID。
- 同步密码不上传。
- 完整 Key 不写入 `settings.json`、globalState 明文、日志或 Webview 状态。
- 关闭同步或离线时，本机 SecretStorage 继续正常工作。

### 7.2 密钥派生与加密

使用 Node.js 内置 `crypto`，不新增第三方加密依赖：

- KDF：异步 `crypto.scrypt`。
- 参数：N=32768、r=8、p=1、最大内存至少 64 MiB。
- Salt：每个 Vault 16 字节随机值。
- 加密：AES-256-GCM。
- Nonce：每次重新加密生成 12 字节随机值。
- Auth tag：16 字节。
- AAD：固定版本标识 `ai-commit-key-vault:v1`。
- 派生出的 Buffer 使用后尽可能 `fill(0)` 清理。

加密明文结构：

```ts
interface VaultPlaintext {
  version: 1;
  revision: number;
  updatedAt: number;
  secrets: Array<{ profileId: string; apiKey: string }>;
}
```

同步密文结构：

```ts
interface EncryptedVaultEnvelope {
  version: 1;
  revision: number;
  kdf: 'scrypt';
  kdfParams: { N: number; r: number; p: number };
  salt: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
  updatedAt: number;
}
```

二进制字段使用 Base64 编码。

### 7.3 新设备解锁

1. Settings Sync 同步 ProfileCatalog 和 EncryptedVaultEnvelope。
2. 页面显示渠道列表，并把尚未解锁的渠道标记为“密钥包已同步，等待解锁”。
3. 用户输入一次同步密码。
4. Extension Host 校验 GCM auth tag 并解密全部 Key。
5. 每个 Key 写入本机 SecretStorage。
6. 保存 lastAppliedVaultRevision。
7. 用户可选择把同步密码保存在本机 SecretStorage，后续自动解锁。

### 7.4 修改与冲突

- 本机新增、编辑或删除 Key 后，先更新 SecretStorage，再生成新 Vault revision。
- Settings Sync 自身可能采用最后写入覆盖。扩展不能假设能自动合并所有并发修改。
- 本机 SecretStorage 永不因远端 Vault 变化而自动删除。
- 当检测到云端 revision 与本机最后应用 revision 不一致时，提供：
  - 导入云端密钥包。
  - 使用本机全部 Key 重建云端密钥包。
  - 暂不处理。
- 解密失败、密码错误或密文损坏时，不覆盖任何本机 Key。

### 7.5 同步密码生命周期

- 创建时要求二次输入并进行最低强度校验。
- 忘记密码无法从云端密文恢复 Key。
- 如果任一设备仍有本机 Key，可在该设备设置新同步密码并重建 Vault。
- 如果没有任何设备保留 Key，只能重新填写渠道 Key。

## 8. 旧配置迁移

迁移只执行一次，并记录 schema migration 标记。

### 8.1 导入规则

- 存在 OpenAI Key 时创建“已导入的 OpenAI” Profile。
- 使用原 OPENAI_BASE_URL、OPENAI_MODEL、API 类型和高级选项。
- 存在 Claude Key 时创建“已导入的 Anthropic” Profile。
- Anthropic Base URL 为空时使用官方默认地址。
- Key 写入对应 Profile 的 SecretStorage 键。
- 原配置中的 AI_PROVIDER 用于设置初始默认 Profile；工作区首次使用时仍要求确认。

### 8.2 事务顺序

1. 读取旧设置并在内存中构造迁移计划。
2. 创建 ProfileCatalog 草稿。
3. 写入 SecretStorage。
4. 逐项读回 SecretStorage 验证。
5. 写入 ProfileCatalog。
6. 清除旧 Settings 中的明文 OpenAI / Claude Key。
7. 写入 migrationComplete 标记。

任一步失败都不清除旧 Key，并显示可重试错误。

## 9. 组件边界

### 9.1 ConfigCenterPanel

- 创建和管理单例 WebviewPanel。
- 设置严格 Content Security Policy 和 nonce。
- 发送已掩码的 ViewModel。
- 接收经过 schema 校验的消息。
- Webview dispose 后释放监听器与内存。

### 9.2 ProfileRepository

- ProfileCatalog 的增删改查。
- 唯一名称、Base URL、模型和 provider-specific options 校验。
- globalState 与 workspaceState 访问。
- 同步键注册。
- 不负责网络请求。

### 9.3 SecretRepository

- SecretStorage 的读写、删除和存在性检查。
- 生成 keyHint。
- 禁止日志输出敏感值。

### 9.4 EncryptedVaultService

- 同步密码验证。
- Vault 加密、解密、版本比较和重建。
- 不访问 Webview。
- 不负责服务商 API。

### 9.5 LegacyConfigurationMigrator

- 检测旧配置。
- 生成并执行事务式迁移计划。
- 迁移失败时保留原状态。

### 9.6 ActiveProfileResolver

- 根据 workspaceState、global default 和本机 SecretStorage 解析当前 Profile。
- 返回运行时所需的完整配置。
- 没有可用 Profile 时返回结构化原因，由命令打开配置中心。

### 9.7 ProviderConnectionTester

- 使用所选 Profile 发起最小成本连接测试。
- OpenAI 优先使用模型列表或轻量请求；兼容渠道不支持时提供降级结果。
- Anthropic 使用最小合法请求或模型列表能力。
- 支持 CancellationToken 和明确超时。

### 9.8 ExistingGenerationPipeline

- 保留 `getDiffStaged`、Prompt 构造、附加上下文、结果清理和 SCM 回填。
- 只把原先从 Settings 读取的 provider 配置替换为 ActiveProfileResolver 返回值。

## 10. 错误处理

- 所有错误使用结构化错误码映射成中英文用户提示。
- Key 缺失：指出具体 Profile，并提供“打开配置中心”。
- Base URL 无效：保留表单内容，不保存或启用。
- 获取模型失败：允许手动填写，不阻塞保存草稿。
- 测试连接失败：不切换生效 Profile。
- SecretStorage 写入失败：不更新 Catalog，不清除旧配置。
- 迁移失败：保留旧 Settings Key，并允许重试。
- 同步密码错误：不删除、不覆盖本机 Key。
- Vault 损坏：提供从本机重建密钥包；没有本机 Key 时提示重新填写。
- 删除当前 Profile：拒绝并要求先切换。
- Webview 消息不合法：拒绝处理并记录不含敏感数据的诊断信息。
- 日志对 URL 可记录，但必须移除 URL userinfo、query 中可能包含的 token，并禁止记录请求 headers 和 Key。

## 11. 国际化

- 运行时 UI 根据 `vscode.env.language` 选择 `zh-cn` 或 `en`，其他语言回退英文。
- 命令标题和静态贡献项使用 `package.nls.json` 与 `package.nls.zh-cn.json`。
- 错误码与用户文案分离，测试两套文案键完整性。
- Profile 名称、Base URL、模型和用户 Prompt 原样保存，不进行翻译。

## 12. 轻量性预算

- Webview 使用原生 DOM、HTML、CSS 和 TypeScript，不引入 UI 框架。
- 不使用 `onStartupFinished`；只在命令触发或缺少配置时激活。
- 纠正或移除当前不匹配的显式 activation event；在支持命令自动激活的 VS Code 版本上依赖命令贡献完成按需激活。
- Webview 资源构建为单个小型脚本和样式文件。
- `retainContextWhenHidden` 设为 false；关闭即销毁。
- 服务商 SDK 在生成或测试时按需加载，避免配置页打开时加载全部 SDK。
- 模型列表不缓存大型响应，只保存模型 ID 字符串和短期时间戳。
- 加密只在 Key 变化、用户主动同步或新设备解锁时运行。
- 删除仓库根目录的 `aicommit.gif`，并移除 README 中对应引用。
- `.vscodeignore` 排除测试、设计文档、开发资源和不需要进入 VSIX 的资产。
- 验收时记录 VSIX 大小；新版本不得因配置中心引入不合理增长。目标是在移除 GIF 后使 VSIX 小于改造前基线。

## 13. 测试设计

### 13.1 单元测试

- ProfileRepository 增删改查、唯一名称、删除规则和默认 Profile。
- ActiveProfileResolver 的工作区优先级、全局回退和缺 Key 状态。
- SecretRepository 的掩码、末四位和不存在状态。
- 旧配置迁移成功、部分失败、读回验证失败和重复执行。
- scrypt + AES-GCM 正常往返。
- 错误同步密码、篡改 ciphertext、nonce、authTag 和 AAD。
- Vault revision 与本机恢复分支。
- Base URL 规范化与敏感 query 日志清理。
- i18n 文案键完整性。

### 13.2 回归测试

- 默认 Prompt 使用快照或固定文本哈希，证明内容未变化。
- 自定义 Prompt 非空时仍替换默认 Prompt。
- 附加上下文仍位于 diff 之前。
- `<think>` 清理和 SCM 写回行为保持一致。
- OpenAI Completion、Responses 和 Anthropic 消息映射保持现有语义。
- 旧 Gemini fallback 行为保持可用。

### 13.3 Webview 与集成测试

- Extension Host 与 Webview 消息 schema。
- 页面只收到掩码 Key，不收到完整 SecretStorage 内容。
- 新增、编辑、测试、启用、删除完整流程。
- 配置中心关闭后监听器释放。
- 中英文渲染和 VS Code 主题变量使用。

### 13.4 VS Code 扩展测试

- 无配置时执行命令打开配置中心。
- 已配置时执行命令不创建 Webview，直接调用生成链路。
- 多仓库工作区解析正确仓库和 activeProfileId。
- 打包 VSIX，并在 Extension Development Host 或本地 VS Code 中安装验证。
- 验证命令面板、SCM 图标、配置入口和生成行为。

### 13.5 性能与包体

- 对比改造前后的生产 bundle 和 VSIX 大小。
- 验证扩展没有 startup activation event。
- 验证配置中心未打开时不会构建 Webview。
- 验证无后台模型请求和同步轮询。

## 14. 文件与模块规划

现有文件尽量保持职责不变，新增模块按边界拆分：

```text
src/
  configuration/
    profile-types.ts
    profile-repository.ts
    secret-repository.ts
    active-profile-resolver.ts
    legacy-configuration-migrator.ts
  sync/
    encrypted-vault-types.ts
    encrypted-vault-service.ts
  providers/
    provider-connection-tester.ts
    runtime-provider-config.ts
  webview/
    config-center-panel.ts
    config-center-controller.ts
    messages.ts
    i18n.ts
    media/
      config-center.js
      config-center.css
  test/
    unit/
    integration/
```

现有 `generate-commit-msg.ts` 只做最小接入；`prompts.ts` 的默认内容不改。

## 15. 实施分阶段

该改造涉及存储、Webview、运行时接入、迁移和加密同步。为避免一次性改动过大，按以下可独立验证的阶段实施，但共享本设计和同一套最终验收标准：

1. **工程基线与测试支架**：修复构建、Lint、测试和 VSIX 打包脚本，记录 Prompt 快照与当前包体基线。
2. **本地 Profile 核心**：实现类型、ProfileRepository、SecretRepository、ActiveProfileResolver 及单元测试，不接入 UI。
3. **可视化配置中心**：实现原生 Webview、渠道列表、新增/编辑、测试连接、中英文和安全消息边界。
4. **生成链路接入与旧配置迁移**：只在服务商调用前解析 Profile，完成事务式旧配置导入，并执行生成回归测试。
5. **端到端加密同步**：实现 Vault 加密、解锁、重建、revision 检查和新设备一次解锁。
6. **轻量化与交付**：移除 GIF、优化 VSIX 内容、执行扩展宿主测试、生成本地 VSIX。

每个阶段必须在进入下一阶段前通过其相关测试。阶段划分不代表缩小最终范围；所有阶段全部完成才满足本设计。

## 16. 打包与本地安装

- 补齐本地可重复执行的 VSIX 打包工具与脚本。
- 生产构建后运行 VSIX 内容检查，确认不包含源码、测试、设计稿、`.superpowers` 和 GIF。
- 生成带明确版本号的 `.vsix`。
- 在用户授权的本地 VS Code 中安装或升级验证；安装动作不涉及 Git。
- Marketplace 发布、Publisher、扩展 ID 和品牌重命名单独处理，不在本次自动执行范围内。

## 17. 验收标准

全部满足后方可认为改造完成：

1. 用户能通过可视化页面创建多套 OpenAI 和 Anthropic 渠道。
2. 两类服务商均支持自定义 Base URL。
3. 当前生效的具体 Profile 在页面固定且清晰可见。
4. 渠道列表能查看完整 Base URL、模型、Key 备注和末四位。
5. 完整 Key 只存在于 SecretStorage 或端到端加密密文中。
6. 渠道元数据可通过 Settings Sync 同步。
7. 开启加密同步后，新设备输入一次同步密码即可恢复全部 Key。
8. 每个工作区可选择独立 Profile。
9. 旧 OpenAI / Claude 明文配置被安全迁移；失败不丢失。
10. 默认 Prompt 和提交生成回归测试通过。
11. 无配置时首次执行打开配置中心；有配置时不加载 Webview。
12. 中英文 UI 可用。
13. `aicommit.gif` 及引用被移除。
14. 自动化测试、生产构建、VSIX 打包和本地安装验证通过。
15. 实施期间没有未经用户授权的 Git 操作。
