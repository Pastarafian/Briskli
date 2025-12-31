# Briskli Usage Guide ⚡

Briskli is more than just a list of texts; it's a dynamic context-aware engine. This guide helps you master its advanced features.

## 🚀 Turbo Mode & Smart Injection

Turbo Mode is activated by **Ctrl + Clicking** (or **Cmd + Clicking** on Mac) any prompt card.

### Setting your Target
In the **Actions** section of the Settings panel, you can choose where Briskli sends the content:
1.  **Cursor**: Attempts to open the Cursor AI chat modal and paste the prompt.
2.  **Copilot**: Opens the GitHub Copilot Chat view and injects the prompt.
3.  **Cody**: Sends the prompt directly to Sourcegraph Cody.
4.  **Editor**: Inserts the prompt directly at your current cursor position in the active text editor.
5.  **Clipboard**: Copies the text but does not perform any automatic injection (useful for web-based LLMs).

### Smart Inject
When enabled, Briskli will attempt to detect if a chat window is already open or if there is a specific input field focused, helping to reduce redundant clicks.

## ✨ Variable Injection

Briskli supports dynamic placeholders in your prompts. Use double curly braces `{{}}` to designate variables:

*   `{{language}}`: Replaced by the currently selected language in the **Modifiers** panel.
*   `{{stack}}`: Replaced by the active framework/stack (e.g., React, Node.js).
*   `{{focus}}`: Replaced by the current quality focus (e.g., Performance, Security).

**Example Prompt**:
> "Refactor this `{{language}}` function for `{{focus}}` using the latest `{{stack}}` best practices."

## 🔮 Predictive Suggestions

The **PREDICTED** section at the top of the sidebar is powered by a real-time analysis engine. It scores prompts based on:
1.  **File Type**: Does this prompt match the current file's extension?
2.  **Recent Errors**: If your file has linting errors, "Fix" and "Debug" prompts will surface automatically.
3.  **Recent Usage**: Prompts you use frequently at this time of day or for this project are prioritized.
4.  **Selection Context**: If you highlight code, Briskli will offer a "Suggest from Selection" option to analyze that specific block.

## ☑️ Select Mode

Use the checkbox icon in the Vault toolbar to enter **Select Mode**.
While in this mode, clicking a card toggles its selection. You can then:
*   **💾 Save**: Copy the selected prompts into a new or existing category.
*   **🗑️ Delete**: Remove multiple prompts at once.
*   **📤 Export**: Generate a JSON file of only the selected prompts.
