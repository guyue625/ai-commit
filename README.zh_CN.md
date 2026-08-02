<a name="readme-top"></a>

<div align="center">

<img height="120" src="https://github.com/Sitoi/ai-commit/blob/main/images/logo.png?raw=true">

<h1>Lin AI Commit</h1>

使用 OpenAI / Azure OpenAI / DeepSeek / Grok / Gemini / Claude (Anthropic) API 审查 Git 暂存区修改，生成符合 Conventional Commit 规范的提交消息，简化提交流程，保持提交规范一致。

[English](./README.md) · **简体中文** · [报告问题][github-issues-link] · [请求功能][github-issues-link]

<!-- SHIELD GROUP -->

[![][github-contributors-shield]][github-contributors-link]
[![][github-forks-shield]][github-forks-link]
[![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link]
[![][vscode-marketplace-shield]][vscode-marketplace-link]
[![][total-installs-shield]][total-installs-link]
[![][avarage-rating-shield]][avarage-rating-link]
[![][github-license-shield]][github-license-link]

</div>

## ✨ 特性

- 🤯 支持使用 OpenAI / Azure OpenAI / DeepSeek / Grok / Gemini / Claude (Anthropic) API 根据 git diffs 自动生成提交信息
- 🎛️ 使用 VS Code 原生配置中心管理多套 OpenAI 和 Anthropic 命名渠道
- 🔐 完整 API Key 只保存在 VS Code SecretStorage，页面仅显示掩码提示
- ☁️ 渠道元数据可随 Settings Sync 同步，并可选择端到端加密同步全部 Key
- 🧠 支持 OpenAI Responses API，可配置推理强度（reasoning effort）和输出详细程度
- 🗺️ 支持多语言提交信息
- 😜 支持添加 Gitmoji
- 🛠️ 支持自定义系统提示词
- 📝 支持 Conventional Commits 规范

## 📦 安装

1. 在 VSCode 中搜索 "AI Commit" 并点击 "Install" 按钮。
2. 从 [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Sitoi.ai-commit) 直接安装。

如果要安装当前 Fork 的本地版本，请运行 `npm install` 和 `npm run package`，然后在 VS Code 中执行 **Install from VSIX...**，选择生成的 `.vsix` 文件。

> **Note**\
> 请确保 Node.js 版本 >= 16

## 🤯 使用

1. 确保您已经安装并启用了 `AI Commit` 扩展。
2. 执行 **AI Commit：打开配置中心**，或点击源代码管理标题栏中的设置图标。
3. 新建 OpenAI 或 Anthropic 渠道，填写 Base URL、模型和 API Key，然后选择 **保存并启用**。
4. 在项目中进行更改并将更改添加到暂存区（`git add`）。
5. 如需补充上下文，可先在源代码管理的提交输入框中填写说明。
6. 点击 AI Commit 图标，生成结果会写回同一个提交输入框。
7. 检查生成的提交信息，确认后再提交。

> **Note**\
> 如果超过最大 token 长度请分批将代码添加到暂存区。

### ⚙️ 配置中心

OpenAI 和 Anthropic 推荐通过配置中心管理：

- 每个服务商都可以保存多套命名渠道。
- OpenAI 兼容接口和 Anthropic 兼容接口都支持自定义 Base URL。
- 页面顶部始终显示真正生效的服务商、配置名称、完整 Base URL、模型和 Key 掩码。
- 查看另一个服务商不会切换当前配置，只有点击 **启用** 或 **保存并启用** 才会改变当前工作区。
- 模型列表仅在主动点击时获取；接口不支持时仍可手动填写模型。
- 渠道列表全局共享，不同工作区可以选择不同的当前渠道。

完整 Key 只保存在 VS Code SecretStorage，不会写入 `settings.json`，不会返回给 Webview，也不会记录到日志。

### 加密 Key 同步

渠道元数据会参与 VS Code Settings Sync。Key 同步默认关闭，开启后会先使用 scrypt 和 AES-256-GCM 在本机端到端加密，再把密文放入 Settings Sync。同步密码不会上传。新设备只需输入一次同步密码，即可把全部 Key 恢复到该设备的 SecretStorage。

### Prompt 与旧配置兼容

内置提交 Prompt 和原生成流程保持不变。自定义 Prompt 非空时仍然完整替换内置 Prompt；留空时继续使用原内置 Prompt。

旧版 OpenAI 和 Claude 明文设置会在首次使用时进行事务式迁移，只有确认 Key 已写入 SecretStorage 后才会清除旧值。旧版 Gemini 设置继续作为兼容分支保留，但配置中心不会新建 Gemini 渠道。

## ⌨️ 本地开发

可以使用 Github Codespaces 进行在线开发：

[![][github-codespace-shield]][github-codespace-link]

或者，可以克隆存储库并运行以下命令进行本地开发：

```bash
$ git clone https://github.com/sitoi/ai-commit.git
$ cd ai-commit
$ npm install
```

在 VSCode 中打开项目文件夹。按 F5 键运行项目。会弹出一个新的 Extension Development Host 窗口，并在其中启动插件。

## 🤝 参与贡献

我们非常欢迎各种形式的贡献。如果你对贡献代码感兴趣，可以查看我们的 GitHub [Issues][github-issues-link]，大展身手，向我们展示你的奇思妙想。

[![][pr-welcome-shield]][pr-welcome-link]

### 💗 感谢我们的贡献者

[![][github-contrib-shield]][github-contrib-link]

## 🔗 链接

### Credits

- **auto-commit** - <https://github.com/lynxife/auto-commit>
- **opencommit** - <https://github.com/di-sukharev/opencommit>

---

## 📝 License

This project is [MIT](./LICENSE) licensed.

<!-- LINK GROUP -->

[github-codespace-link]: https://codespaces.new/sitoi/ai-commit
[github-codespace-shield]: https://github.com/sitoi/ai-commit/blob/main/images/codespaces.png?raw=true
[github-contributors-link]: https://github.com/sitoi/ai-commit/graphs/contributors
[github-contributors-shield]: https://img.shields.io/github/contributors/sitoi/ai-commit?color=c4f042&labelColor=black&style=flat-square
[github-forks-link]: https://github.com/sitoi/ai-commit/network/members
[github-forks-shield]: https://img.shields.io/github/forks/sitoi/ai-commit?color=8ae8ff&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/sitoi/ai-commit/issues
[github-issues-shield]: https://img.shields.io/github/issues/sitoi/ai-commit?color=ff80eb&labelColor=black&style=flat-square
[github-license-link]: https://github.com/sitoi/ai-commit/blob/main/LICENSE
[github-license-shield]: https://img.shields.io/github/license/sitoi/ai-commit?color=white&labelColor=black&style=flat-square
[github-stars-link]: https://github.com/sitoi/ai-commit/network/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/sitoi/ai-commit?color=ffcb47&labelColor=black&style=flat-square
[pr-welcome-link]: https://github.com/sitoi/ai-commit/pulls
[pr-welcome-shield]: https://img.shields.io/badge/🤯_pr_welcome-%E2%86%92-ffcb47?labelColor=black&style=for-the-badge
[github-contrib-link]: https://github.com/sitoi/ai-commit/graphs/contributors
[github-contrib-shield]: https://contrib.rocks/image?repo=sitoi%2Fai-commit
[vscode-marketplace-link]: https://marketplace.visualstudio.com/items?itemName=Sitoi.ai-commit
[vscode-marketplace-shield]: https://img.shields.io/vscode-marketplace/v/Sitoi.ai-commit.svg?label=vscode%20marketplace&color=blue&labelColor=black&style=flat-square
[total-installs-link]: https://marketplace.visualstudio.com/items?itemName=Sitoi.ai-commit
[total-installs-shield]: https://img.shields.io/vscode-marketplace/d/Sitoi.ai-commit.svg?&labelColor=black&style=flat-square
[avarage-rating-link]: https://marketplace.visualstudio.com/items?itemName=Sitoi.ai-commit
[avarage-rating-shield]: https://img.shields.io/vscode-marketplace/r/Sitoi.ai-commit.svg?color=green&labelColor=black&style=flat-square
