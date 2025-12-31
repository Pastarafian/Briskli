<p align="center">
  <img src="icon.png" width="128" alt="Briskli Logo">
</p>

# Briskli
### Productivity & Prompt Management for VS Code

[![Version](https://img.shields.io/badge/version-0.1.1-cyan.svg)](https://github.com/Pastarafian/Briskli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-VS%20Code-brightgreen.svg)](https://marketplace.visualstudio.com/items?itemName=Pastarafian.briskli)

**Briskli** is a productivity tool designed to help developers manage, organize, and quickly use AI prompts within VS Code. It replaces the repetitive process of typing out long context instructions with a simple, organized sidebar system.

Whether you are debugging, writing documentation, or planning a new feature, Briskli keeps your most useful instructions just a click away.

---

## 🚀 Key Features

### 📂 Organized Prompt Vault
Briskli comes pre-loaded with a library of useful prompts organized into straightforward categories. You can also edit these or add your own.
*   **Bugs**: Prompts for finding silent failures, race conditions, and memory leaks.
*   **Refine**: Instructions for cleaning code, variable naming, and refactoring.
*   **Testing**: Quick generation of unit tests and edge cases.
*   **Docs**: Templates for writing READMEs, API specs, and ADRs.
*   **...and more**: Including Planning, Security, Deployment, and Database tasks.

### ⚡ Quick Context Injection
When you use a prompt from Briskli, it doesn't just copy text. It automatically detects your current context to save you time:
*   **Language & Framework**: Automatically fills in "Python" or "React" based on your active file.
*   **Tone & Length**: Respects your global settings for how you want the AI to reply.

### 🎯 Predictive Suggestions
To speed up your workflow, the top section of the sidebar shows "Predicted" prompts based on your current activity. If you are editing a TypeScript file, it might suggest type-checking prompts. If you just opened a file, it might suggest "Explain Code".

### 🛠️ Prompt Generator
If you need a specific prompt that isn't in the library, the built-in "Generator" tool can help you create one. Simply describe what you need (e.g., "Review this code for accessibility compliance") and Briskli will format it into a reusable prompt template for you to save.

---

## 📖 How to Use

### 1. The Sidebar
After installing, clicking the **Briskli icon** in your activity bar opens the main view.
*   **Click**: Inserts the prompt into your active editor or AI chat input.
*   **Ctrl/Cmd + Click**: "Turbo" mode – immediately submits the prompt if supported by your setup.

### 2. Managing Prompts
*   **Edit**: Click the pencil icon on any prompt to change its text.
*   **Delete**: Remove prompts you don't use.
*   **Search**: Use the filter bar to find specific tasks like "SQL" or "Jest".

### 3. Using Variables
Briskli uses strict variable templating to make prompts reusable. You can use these in your own prompts:
*   `{{language}}`: The language of the currently active file (e.g., TypeScript).
*   `{{framework}}`: The detected framework (e.g., React, Django).
*   `{{focus}}`: The specific code you have selected.

---

## ⚙️ Configuration

You can customize the extension's behavior in VS Code Settings (`Ctrl+,` -> search "Briskli").

### AI Response Preferences
*   **Attitude/Tone**: Choose between "Casual", "Professional", or "Socratic" (Teaching mode).
*   **Response Length**: Set whether you want "Concise" answers or "Detailed" explanations.

### Vault Management
*   **Sort Order**: Choose to sort prompts Alphabetically or by Usage frequency.
*   **Import/Export**: You can export your entire vault to a JSON file to share with your team or back up your personal collection.

---

## 🤝 Contributing

This is an open-source project focused on developer productivity. If you have suggestions or want to add new default prompts, feel free to contribute.

*   [GitHub Repository](https://github.com/Pastarafian/Briskli)
*   [Report an Issue](https://github.com/Pastarafian/Briskli/issues)

---

<p align="center">
  <b>Code faster, type less.</b>
</p>
