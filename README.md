<a name="readme-top"></a>

<div align="center">

<img height="120" src="https://github.com/Sitoi/ai-commit/blob/main/images/logo.png?raw=true">

<h1>Lin AI Commit</h1>

Use OpenAI / Azure OpenAI / DeepSeek / Grok / Gemini / Claude (Anthropic) API to review Git changes, generate conventional commit messages that meet the conventions, simplify the commit process, and keep the commit conventions consistent.

**English** · [简体中文](./README.zh_CN.md) · [Report Bug][github-issues-link] · [Request Feature][github-issues-link]

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

## ✨ Features

- 🤯 Support generating commit messages based on git diffs using OpenAI / Azure OpenAI / DeepSeek / Grok / Gemini / Claude (Anthropic) API.
- 🎛️ Manage multiple named OpenAI and Anthropic channel profiles in a native VS Code Config Center.
- 🔐 Keep full API keys in VS Code SecretStorage and show only masked key hints in the UI.
- ☁️ Sync profile metadata through Settings Sync, with optional end-to-end encrypted key sync.
- 🧠 Support OpenAI Responses API with configurable reasoning effort and output verbosity.
- 🗺️ Support multi-language commit messages.
- 😜 Support adding Gitmoji.
- 🛠️ Support custom system prompt.
- 📝 Support Conventional Commits specification.

## 📦 Installation

1. Search for "AI Commit" in VSCode and click the "Install" button.
2. Install it directly from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Sitoi.ai-commit).

For a local build of this fork, run `npm install` and `npm run package`, then install the generated `.vsix` from VS Code's **Install from VSIX...** command.

> **Note**\
> Make sure your node version >= 16

## 🤯 Usage

1. Ensure that you have installed and enabled the "AI Commit" extension.
2. Run **AI Commit: Open Config Center**, or click the settings icon in the Source Control title bar.
3. Create an OpenAI or Anthropic channel profile, enter its Base URL, model, and API key, then choose **Save and Activate**.
4. Make changes in your project and add the changes to the staging area (`git add`).
5. Optionally type extra context in the Source Control message input before running AI Commit.
6. Click the AI Commit icon. The generated message is written back to the same Source Control input box.
7. Review the generated message and commit when ready.

> **Note**\
> If the code exceeds the maximum token length, consider adding it to the staging area in batches.

### ⚙️ Config Center

The Config Center is the recommended way to configure OpenAI and Anthropic:

- Save multiple named profiles for each provider.
- Use a custom Base URL for both OpenAI-compatible and Anthropic-compatible channels.
- See the exact active provider, profile name, Base URL, model, and masked key hint at all times.
- View a different provider without changing the active profile. Only **Activate** or **Save and Activate** switches the current workspace.
- Fetch available models explicitly, or enter a model manually when an endpoint does not support model listing.
- Keep profile metadata globally available while selecting a different active profile per workspace.

Full keys are stored in VS Code SecretStorage. They are never written to `settings.json`, returned to the Webview, or shown in logs.

### Encrypted key sync

Profile metadata participates in VS Code Settings Sync. Key sync is optional and disabled by default. When enabled, all local profile keys are encrypted with scrypt and AES-256-GCM before the encrypted vault is placed in Settings Sync. The sync password is never uploaded. On another device, enter that password once to restore all keys to that device's SecretStorage.

### Prompt and legacy compatibility

The built-in commit Prompt and generation flow are unchanged. A non-empty custom Prompt still replaces the built-in Prompt; an empty value continues to use the built-in Prompt.

Existing plaintext OpenAI and Claude settings are imported transactionally on first use and cleared only after their keys have been verified in SecretStorage. Legacy Gemini settings remain available as a compatibility fallback and are not exposed as new Config Center profiles.

## ⌨️ Local Development

You can use Github Codespaces for online development:

[![][github-codespace-shield]][github-codespace-link]

Alternatively, you can clone the repository and run the following commands for local development:

```bash
$ git clone https://github.com/sitoi/ai-commit.git
$ cd ai-commit
$ npm install
```

Open the project folder in VSCode. Press F5 to run the project. This will open a new Extension Development Host window and launch the plugin within it.

## 🤝 Contributing

Contributions of all types are more than welcome, if you are interested in contributing code, feel free to check out our GitHub [Issues][github-issues-link] to get stuck in to show us what you’re made of.

[![][pr-welcome-shield]][pr-welcome-link]

### 💗 All Thanks To Our Contributors

[![][github-contrib-shield]][github-contrib-link]

## 🔗 Links

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
[total-installs-shield]: https://img.shields.io/vscode-marketplace/d/Sitoi.ai-commit.svg?&color=greeen&labelColor=black&style=flat-square
[avarage-rating-link]: https://marketplace.visualstudio.com/items?itemName=Sitoi.ai-commit
[avarage-rating-shield]: https://img.shields.io/vscode-marketplace/r/Sitoi.ai-commit.svg?&color=green&labelColor=black&style=flat-square
