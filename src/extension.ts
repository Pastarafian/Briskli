import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// --- INTERFACES ---
interface PromptItem {
    id: string;
    title: string;
    prompt: string;
    category: string;
    usageCount: number;
    lastUsed: number;
    reason?: string;
    isPinned?: boolean;
}

interface PromptCategory {
    id: string;
    name: string;
    icon?: string;
    prompts: PromptItem[];
}

interface Mode { id: string; name: string; icon: string; directive: string; }

interface PredictionContext {
    recentLanguages: string[];
    recentKeywords: string[];
    hasErrors: boolean;
    isTestFile: boolean;
    lastEditType: 'add' | 'delete' | 'change' | null;
    recentFileTypes: string[];
    habitWeights: Record<string, number>;
}

interface PromptData {
    categories: PromptCategory[];
    playbooks: PromptItem[];
    suggested: PromptItem[];
    modes: Mode[];
    activeModeId: string;
    customStacks: string[];
    customLanguages: string[];
    customFocuses: string[];
    customStyles: string[];
    settings: {
        sortType: string;
        attitude: string;
        responseLength: string;
        turboTarget: 'copilot' | 'cursor' | 'cody' | 'editor' | 'clipboard';
        smartInject: boolean;
        selectedContext: {
            language?: string;
            focus?: string;
            framework?: string;
            style?: string;
            toggles?: { l: boolean; s: boolean; f: boolean; y: boolean; };
        };
    };
    pinnedIds: string[];
    recentlyUsedIds: string[];
}

// --- SHARED DATA MANAGER ---
class BriskliDataManager {
    private _promptsData: PromptData;
    private _predictionContext: PredictionContext = {
        recentLanguages: [],
        recentKeywords: [],
        hasErrors: false,
        isTestFile: false,
        lastEditType: null,
        recentFileTypes: [],
        habitWeights: {}
    };

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _globalState: vscode.Memento) {
        this._promptsData = this.loadPrompts();
        this.recalculateHabits();
    }

    public get data() { return this._promptsData; }
    public get predictionContext() { return this._predictionContext; }

    private recalculateHabits() {
        const all = this.getAllPrompts();
        const weights: Record<string, number> = {};
        all.forEach(p => {
            if (p.usageCount > 0) {
                weights[p.category] = (weights[p.category] || 0) + p.usageCount;
            }
        });
        this._predictionContext.habitWeights = weights;
    }

    public registerClick(id: string) {
        const all = [...this.getAllPrompts(), ...this._promptsData.playbooks, ...this._promptsData.suggested];
        const p = all.find(x => x.id === id);
        if (p) {
            p.usageCount++;
            p.lastUsed = Date.now();

            // Handle recently used list
            this._promptsData.recentlyUsedIds = [id, ...this._promptsData.recentlyUsedIds.filter(x => x !== id)].slice(0, 50);

            this.recalculateHabits();
            this.saveUserData();
        }
    }

    private loadPrompts(): PromptData {
        const promptsPath = path.join(this._extensionUri.fsPath, 'src', 'prompts.json');
        const savedData = this._globalState.get<Partial<PromptData>>('briskli.userData', {});
        let baseData: any = { categories: [], playbooks: [] };
        if (fs.existsSync(promptsPath)) {
            try { baseData = JSON.parse(fs.readFileSync(promptsPath, 'utf8')); } catch (e) { console.error(e); }
        }

        const finalCats: PromptCategory[] = (baseData.categories || []).map((c: any) => ({ ...c, icon: undefined })); // Remove icons from base
        if (savedData.categories) {
            savedData.categories.forEach(sc => {
                const existing = finalCats.find(c => c.id === sc.id);
                if (existing) {
                    sc.prompts.forEach(sp => {
                        if (!existing.prompts.find(p => p.id === sp.id)) existing.prompts.push(sp);
                    });
                } else {
                    finalCats.push({ ...sc, icon: undefined });
                }
            });
        }

        if (!finalCats.find(c => c.id === 'gen')) {
            finalCats.push({ id: 'gen', name: 'Generated', prompts: [] });
        }

        // Expanded default GitHub prompts to 25
        if (!finalCats.find(c => c.id === 'suggested')) {
            finalCats.push({ id: 'suggested', name: 'Suggested', prompts: [] });
        }

        const defaultLangs = ['typescript', 'javascript', 'python', 'rust', 'go'];
        const defaultStacks = ['React', 'Next.js', 'Tailwind', 'Node.js', 'Postgres'];
        const defaultFocuses = ['Performance', 'Security', 'Readability', 'Maintainability'];
        const defaultStyles = ['Clean', 'Brief', 'Detailed', 'Socratic'];

        return {
            categories: finalCats,
            playbooks: baseData.playbooks || [],
            suggested: [],
            modes: [
                { id: 'discuss', name: 'Discuss', icon: '💬', directive: 'Discuss the logic first.' },
                { id: 'implement', name: 'Implement', icon: '🛠️', directive: 'Provide code implementation.' },
                { id: 'concept', name: 'Concept', icon: '🧠', directive: 'Explain the high-level concept.' },
                { id: 'review', name: 'Review', icon: '👀', directive: 'Review the code quality.' },
                { id: 'test', name: 'Test', icon: '🧪', directive: 'Generate comprehensive tests.' },
                { id: 'debug', name: 'Debug', icon: '🐛', directive: 'Debug the following issue.' }
            ],
            activeModeId: savedData.activeModeId || 'implement',
            customStacks: Array.from(new Set([...defaultStacks, ...(savedData.customStacks || [])])),
            customLanguages: Array.from(new Set([...defaultLangs, ...(savedData.customLanguages || [])])),
            customFocuses: Array.from(new Set([...defaultFocuses, ...(savedData.customFocuses || [])])),
            customStyles: Array.from(new Set([...defaultStyles, ...(savedData.customStyles || [])])),
            settings: {
                sortType: savedData.settings?.sortType || 'def',
                attitude: savedData.settings?.attitude || 'Pro',
                responseLength: savedData.settings?.responseLength || 'Short',
                turboTarget: savedData.settings?.turboTarget || 'cursor',
                smartInject: savedData.settings?.smartInject !== false,
                selectedContext: savedData.settings?.selectedContext || { toggles: { l: true, s: true, f: true, y: true } }
            },
            pinnedIds: savedData.pinnedIds || [],
            recentlyUsedIds: savedData.recentlyUsedIds || []
        };
    }

    public saveUserData() {
        this._globalState.update('briskli.userData', {
            activeModeId: this._promptsData.activeModeId,
            settings: this._promptsData.settings,
            categories: this._promptsData.categories,
            customStacks: this._promptsData.customStacks,
            customLanguages: this._promptsData.customLanguages,
            customFocuses: this._promptsData.customFocuses,
            customStyles: this._promptsData.customStyles,
            pinnedIds: this._promptsData.pinnedIds,
            recentlyUsedIds: this._promptsData.recentlyUsedIds
        });
    }

    public getAllPrompts() { return this._promptsData.categories.flatMap(c => c.prompts); }

    public resolveVars(text: string): string {
        const s = this._promptsData.settings.selectedContext || {};
        const toggles = s.toggles || { l: true, s: true, f: true, y: true };
        const mode = this._promptsData.modes.find(m => m.id === this._promptsData.activeModeId);

        let final = text;
        if (mode) final = mode.directive + " " + final;

        // Add meta instructions from settings
        const attitude = this._promptsData.settings.attitude;
        const length = this._promptsData.settings.responseLength;
        final = `[Tone: ${attitude}, Length: ${length}] ` + final;

        const vars: Record<string, string> = {
            'language': toggles.l ? (s.language || 'language') : '',
            'stack': toggles.s ? (s.framework || 'framework') : '',
            'focus': toggles.f ? (s.focus || 'focus') : '',
            'context': toggles.y ? (s.style || 'context') : ''
        };

        return final.replace(/\{\{(.*?)\}\}/g, (m, key) => {
            const val = vars[key.trim().toLowerCase()];
            return val !== undefined ? (val || '') : m;
        });
    }

    public scorePredictedPrompts(): PromptItem[] {
        const allPrompts = [...this.getAllPrompts(), ...this._promptsData.playbooks];
        const ctx = this._predictionContext;
        const currentLang = vscode.window.activeTextEditor?.document.languageId || '';

        const scoredPrompts = allPrompts.map(p => {
            let score = 0;
            let reasons = [];
            if (ctx.habitWeights[p.category]) { score += Math.min(ctx.habitWeights[p.category] * 2, 25); reasons.push('Habit'); }
            score += Math.min(p.usageCount * 3, 20);
            const hoursSinceUse = (Date.now() - (p.lastUsed || 0)) / (1000 * 60 * 60);
            if (hoursSinceUse < 1) { score += 15; reasons.push('Recent'); }
            const pText = (p.title + ' ' + p.prompt).toLowerCase();
            if (currentLang && (pText.includes(currentLang) || pText.includes('{{language}}'))) { score += 20; reasons.push('Lang'); }
            if (ctx.hasErrors && (p.category === 'fixing')) { score += 30; reasons.push('Fix'); }
            return { prompt: { ...p, reason: reasons[0] || '' }, score };
        });

        const top = scoredPrompts.sort((a, b) => b.score - a.score).slice(0, 16).map(s => s.prompt);
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            top.unshift({
                id: 'synth_selection',
                title: '✨ Suggest from Selection',
                prompt: 'Analyze highlighted code...',
                category: 'gen', usageCount: 0, lastUsed: 0, reason: 'Selection'
            });
        }
        return top;
    }

    public trackEditorChange(editor: vscode.TextEditor) {
        const lang = editor.document.languageId;
        this._predictionContext.recentLanguages = [lang, ...this._predictionContext.recentLanguages.filter(l => l !== lang)].slice(0, 5);
        this._predictionContext.isTestFile = editor.document.fileName.toLowerCase().includes('test') || editor.document.fileName.toLowerCase().includes('spec');
    }

    public trackDocumentChange(event: vscode.TextDocumentChangeEvent) {
        if (event.contentChanges.length === 0) return;
        const text = event.contentChanges[0].text.toLowerCase();
        const kws = ['fix', 'bug', 'error', 'todo', 'hack', 'refactor', 'optimize'];
        this._predictionContext.recentKeywords = kws.filter(kw => text.includes(kw));

        if (event.contentChanges[0].rangeLength > 0 && event.contentChanges[0].text.length === 0) this._predictionContext.lastEditType = 'delete';
        else if (event.contentChanges[0].rangeLength === 0 && event.contentChanges[0].text.length > 0) this._predictionContext.lastEditType = 'add';
        else this._predictionContext.lastEditType = 'change';
    }

    public trackDiagnosticsChange(editor: vscode.TextEditor | undefined) {
        if (!editor) { this._predictionContext.hasErrors = false; return; }
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        this._predictionContext.hasErrors = diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error);
    }
}

// --- VIEW PROVIDER ---
class BriskliViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'briskli.views.main';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _manager: BriskliDataManager) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Re-send data when webview becomes visible again (after collapse/expand)
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateWebview();
            }
        });

        webviewView.webview.onDidReceiveMessage(async (m) => {
            switch (m.type) {
                case 'promptClick': await this.handlePromptClick(m.id, m.ctrl); break;
                case 'copy': await this.handleCopy(m.id); break;
                case 'setMode':
                    this._manager.data.activeModeId = m.id;
                    this._manager.saveUserData();
                    this.updateWebview();
                    break;
                case 'upSettings':
                    this._manager.data.settings = { ...this._manager.data.settings, ...m.s };
                    this._manager.saveUserData();
                    this.updateWebview();
                    break;
                case 'addCustom':
                    const val = await vscode.window.showInputBox({ prompt: `Enter new ${m.cat}` });
                    if (val) {
                        const s = this._manager.data.settings.selectedContext;
                        if (m.cat === 'Language') { this._manager.data.customLanguages.push(val); s.language = val; }
                        else if (m.cat === 'Stack') { this._manager.data.customStacks.push(val); s.framework = val; }
                        else if (m.cat === 'Focus') { this._manager.data.customFocuses.push(val); s.focus = val; }
                        else if (m.cat === 'Style') { this._manager.data.customStyles.push(val); s.style = val; }
                        this._manager.saveUserData();
                        this.updateWebview();
                    }
                    break;
                case 'aiGen': await this.handleAiGen("Custom"); break;
                case 'addCategory':
                    const name = await vscode.window.showInputBox({ prompt: "Category Name" });
                    if (name) {
                        this._manager.data.categories.push({ id: name.toLowerCase().replace(/\s/g, '_'), name, prompts: [] });
                        this._manager.saveUserData();
                        this.updateWebview();
                    }
                    break;
                case 'delCategory':
                    const items = this._manager.data.categories.map(c => ({ label: c.name, id: c.id }));
                    const sel = await vscode.window.showQuickPick(items, { title: "Select Category to Delete" });
                    if (sel) {
                        const confirm = await vscode.window.showWarningMessage(`Delete Category "${sel.label}"?`, { modal: true }, 'Delete');
                        if (confirm === 'Delete') {
                            this._manager.data.categories = this._manager.data.categories.filter(c => c.id !== sel.id);
                            this._manager.saveUserData();
                            this.updateWebview();
                        }
                    }
                    break;
                case 'togglePin':
                    const pId = m.id;
                    if (this._manager.data.pinnedIds.includes(pId)) {
                        this._manager.data.pinnedIds = this._manager.data.pinnedIds.filter(id => id !== pId);
                    } else {
                        this._manager.data.pinnedIds.push(pId);
                    }
                    this._manager.saveUserData();
                    this.updateWebview();
                    break;
                case 'editPrompt':
                    const ep = this._manager.getAllPrompts().find(x => x.id === m.id);
                    if (ep) {
                        const newTitle = await vscode.window.showInputBox({ prompt: "Edit Title", value: ep.title });
                        if (newTitle === undefined) return;
                        const newText = await vscode.window.showInputBox({ prompt: "Edit Prompt Content", value: ep.prompt });
                        if (newText === undefined) return;
                        ep.title = newTitle;
                        ep.prompt = newText;
                        this._manager.saveUserData();
                        this.updateWebview();
                    }
                    break;
                case 'export':
                    const exportData = JSON.stringify(this._manager.data, null, 2);
                    const doc = await vscode.workspace.openTextDocument({ content: exportData, language: 'json' });
                    await vscode.window.showTextDocument(doc);
                    break;
                case 'import':
                    const importText = await vscode.window.showInputBox({ prompt: "Paste Exported JSON here" });
                    if (importText) {
                        try {
                            const parsed = JSON.parse(importText);
                            if (parsed.categories) {
                                this._manager.data.categories = parsed.categories;
                                if (parsed.pinnedIds) this._manager.data.pinnedIds = parsed.pinnedIds;
                                this._manager.saveUserData();
                                this.updateWebview();
                                vscode.window.showInformationMessage("Import Successful!");
                            }
                        } catch (e) { vscode.window.showErrorMessage("Invalid JSON for import."); }
                    }
                    break;
                case 'showAnalytics':
                    const analytics = this._manager.getAllPrompts()
                        .sort((a, b) => b.usageCount - a.usageCount)
                        .slice(0, 10)
                        .map(p => `${p.title}: ${p.usageCount} times`)
                        .join('\n');
                    vscode.window.showInformationMessage(`Top Prompts:\n${analytics}`, { modal: true });
                    break;
                case 'saveTo':
                    const { promptIds, catIds } = m;
                    const sources = [...this._manager.getAllPrompts(), ...this._manager.data.suggested, ...this._manager.data.playbooks];
                    promptIds.forEach((id: string) => {
                        const p = sources.find(x => x.id === id);
                        if (p) {
                            catIds.forEach((catId: string) => {
                                const cat = this._manager.data.categories.find(c => c.id === catId);
                                if (cat && !cat.prompts.find(e => e.id === p.id)) cat.prompts.push({ ...p, category: catId });
                            });
                        }
                    });
                    this._manager.saveUserData();
                    this._view?.webview.postMessage({ type: 'toast', msg: 'Saved!' });
                    this.updateWebview();
                    break;
                case 'deletePrompts':
                    const { promptIds: dIds, activeTab } = m;
                    const cnf = await vscode.window.showWarningMessage(`Delete ${dIds.length} prompts?`, { modal: true }, 'Delete');
                    if (cnf !== 'Delete') return;
                    if (activeTab === 'playbooks') this._manager.data.playbooks = this._manager.data.playbooks.filter(p => !dIds.includes(p.id));
                    else if (activeTab === 'suggested') this._manager.data.suggested = this._manager.data.suggested.filter(p => !dIds.includes(p.id));
                    else {
                        this._manager.data.categories.forEach(c => { c.prompts = c.prompts.filter(p => !dIds.includes(p.id)); });
                    }
                    this._manager.saveUserData();
                    this.updateWebview();
                    break;
            }
        });
        this.updateWebview();
    }

    private async handlePromptClick(id: string, ctrl: boolean) {
        if (id === 'synth_selection') { await this.handleAiGen("Selection Suggestions"); return; }
        this._manager.registerClick(id);
        const p = [...this._manager.getAllPrompts(), ...this._manager.data.playbooks, ...this._manager.data.suggested].find(x => x.id === id);
        if (!p) return;
        const final = this._manager.resolveVars(p.prompt);

        if (ctrl) {
            const settings = this._manager.data.settings;
            const target = settings.turboTarget || 'cursor';

            // Always copy to clipboard first
            await vscode.env.clipboard.writeText(final);

            try {
                switch (target) {
                    case 'copilot':
                        await vscode.commands.executeCommand('workbench.action.chat.open', { query: final });
                        break;
                    case 'cursor':
                        // Try Cursor's chat command, fallback to Copilot
                        try {
                            await vscode.commands.executeCommand('aipopup.action.modal.generate', { text: final });
                        } catch {
                            await vscode.commands.executeCommand('workbench.action.chat.open', { query: final });
                        }
                        break;
                    case 'cody':
                        // Try Cody's chat command
                        try {
                            await vscode.commands.executeCommand('cody.chat.submit', final);
                        } catch {
                            await vscode.commands.executeCommand('workbench.action.chat.open', { query: final });
                        }
                        break;
                    case 'editor':
                        // Insert at cursor position in active editor
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            await editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, final);
                            });
                        }
                        break;
                    case 'clipboard':
                        // Already copied above, just show toast
                        break;
                }
                this._view?.webview.postMessage({ type: 'toast', msg: target === 'editor' ? 'Inserted!' : target === 'clipboard' ? 'Copied!' : 'Sent to ' + target + '!' });
            } catch (err) {
                // Fallback: just keep clipboard copy
                this._view?.webview.postMessage({ type: 'toast', msg: 'Copied! (target unavailable)' });
            }
        } else {
            await vscode.env.clipboard.writeText(final);
            this._view?.webview.postMessage({ type: 'toast', msg: 'Copied!' });
        }
        this.updateWebview();
    }

    private async handleCopy(id: string) {
        const p = [...this._manager.getAllPrompts(), ...this._manager.data.playbooks, ...this._manager.data.suggested].find(x => x.id === id);
        if (!p) return;
        const final = this._manager.resolveVars(p.prompt);
        await vscode.env.clipboard.writeText(final);
        this._view?.webview.postMessage({ type: 'toast', msg: 'Copied!' });
    }

    public async handleAiGen(input: any) {
        const editor = vscode.window.activeTextEditor;
        const selection = editor?.document.getText(editor.selection) || "";

        let topic = "Custom";
        let count = 25; // Default from user request
        let sectionName = "";

        // Handle input types
        if (typeof input === 'string') {
            topic = input;
            if (topic === "Custom") {
                // Determine if this is a legacy call or command palette
                // For command palette, we might want to ask via input box, 
                // but since the UI button now opens a modal, this is likely a fallback.
                const val = await vscode.window.showInputBox({ prompt: "Topic for new prompts" });
                if (!val) return;
                topic = val;
                sectionName = val;
            }
        } else {
            topic = input.prompt || "Custom";
            sectionName = input.name || "Generated";
            count = Math.max(5, Math.min(50, input.count || 25));
        }

        const isSuggested = (typeof input === 'string' && input.includes("Selection")) || topic.includes("Selection");

        if (isSuggested) {
            this._manager.data.suggested.length = 0;
            const topics = ['Optimize', 'Fix Errors', 'Explain', 'Security Audit'];
            topics.forEach((t, i) => {
                this._manager.data.suggested.push({
                    id: 'sug_' + Date.now() + i,
                    title: `✨ ${t}`,
                    prompt: `${t} this code: \n\n${selection}\n\nUsing {{stack}} focus on {{focus}}.`,
                    category: 'suggested', usageCount: 0, lastUsed: 0
                });
            });
            this._view?.webview.postMessage({ type: 'doTab', id: 'suggested' });
        } else {
            let genCat = this._manager.data.categories.find(c => c.id === 'gen');
            if (!genCat) { genCat = { id: 'gen', name: 'Generated', prompts: [] }; this._manager.data.categories.push(genCat); }

            const ctx = input.context || {};
            const roleInfo = ctx.role ? `Role: ${ctx.role}. ` : '';
            const intentInfo = ctx.intent ? `Intent: ${ctx.intent}. ` : '';
            const diffInfo = ctx.difficulty ? `Complexity: ${ctx.difficulty}. ` : '';

            // Generate requested number
            for (let i = 0; i < count; i++) {
                genCat.prompts.push({
                    id: 'ai_' + Date.now() + i,
                    title: `[AI] ${sectionName} ${i + 1}`,
                    prompt: `${roleInfo}${intentInfo}Focus on ${topic}. ${diffInfo}\n\n(Variation ${i + 1}: Provide a unique perspective.)`,
                    category: 'gen', usageCount: 0, lastUsed: Date.now()
                });
            }
            this._manager.saveUserData();
            this._view?.webview.postMessage({ type: 'doTab', id: 'gen' });
        }
        this.updateWebview();
    }

    public updateWebview() {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: 'update',
            data: this._manager.data,
            predicted: this._manager.scorePredictedPrompts()
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();
        return `<!DOCTYPE html><html><head>
			<style>
				:root { --accent: #00ffcc; --accent-dim: rgba(0, 255, 204, 0.1); --bg: var(--vscode-sideBar-background); --card-bg: var(--vscode-editor-background); --card-border: var(--vscode-panel-border); --text: var(--vscode-foreground); }
				* { box-sizing: border-box; }
				body { margin: 0; padding: 0; font-family: var(--vscode-font-family); color: var(--text); background: var(--bg); display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-size: 13px; }
				.content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); padding-bottom: 4px; }
                .search-toolbar { height: 28px; border-bottom: 1px solid var(--card-border); padding: 0 8px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: var(--bg); z-index: 20; }
                .search-input { flex: 1; height: 20px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 2px; color: var(--text); outline: none; padding: 0 8px; font-size: 11px; }
				.pred-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.5; white-space: nowrap; font-weight: bold; margin-left: auto; }
				.gen-btn { cursor: pointer; opacity: 0.8; font-size: 10px; font-weight: bold; display: flex; align-items: center; gap: 4px; transition: 0.2s; white-space: nowrap; }
				.gen-btn:hover { opacity: 1; color: var(--accent); }
				.section-header { display: none; } /* Deprecated */
				.pred-sec { flex-shrink: 0; display: flex; flex-direction: column; border-bottom: 1px solid var(--card-border); }
				.pred-sec .grid-container { height: 92px; overflow-y: auto; padding: 4px 8px; }
				.vault-sec { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 122px; }
				.vault-sec .grid-container { flex: 1; overflow-y: auto; padding: 4px 8px 8px 8px; }
				.grid-container { border-bottom: 1px solid rgba(255,255,255,0.02); }
				.grid-container::-webkit-scrollbar { width: 4px; }
				.grid-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
				.prompt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; padding-bottom: 4px; }
				
				/* RESTORED COMPONENT STYLES */
				.prompt-card { background: var(--card-bg); border: 1px solid var(--card-border); padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: 0.2s; height: 24px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; position: relative; user-select: none; outline: none; }
				.prompt-card:focus { border-color: var(--accent); background: var(--accent-dim); }
				.prompt-card:hover { border-color: rgba(0, 255, 204, 0.4); background: rgba(255,255,255,0.02); }
				.prompt-card.expanded { grid-column: span 2; grid-row: span 3; height: auto !important; min-height: 40px; border-color: var(--accent); background: var(--accent-dim); padding: 5px 6px 3px 6px; z-index: 10; cursor: default; justify-content: flex-start; gap: 4px; }
				.prompt-card.selected { border-color: var(--accent); background: var(--accent-dim); }
				.prompt-card.pinned::after { content: '📌'; position: absolute; top: 1px; right: 1px; font-size: 6px; opacity: 0.6; }
				.prompt-title { font-size: 9.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); opacity: 0.8; }
				.expanded .prompt-title { white-space: normal; margin-bottom: 0px; color: var(--accent); padding-right: 14px; font-size: 10px; opacity: 1; }
				.prompt-content { display: none; font-size: 9px; line-height: 1.25; opacity: 0.9; color: var(--text); margin-bottom: 2px; white-space: pre-wrap; user-select: text; }
				.expanded .prompt-content { display: block; margin-bottom: 0; line-height: 1.2; }
				.card-actions { display: none; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
				.expanded .card-actions { display: flex; }
				.card-check { position: absolute; top: 3px; left: 3px; opacity: 1; transform: scale(0.8); display: none; margin:0; cursor: pointer; }
				.ctrl-mode .card-check { display: block; }
				.action-btn { background: var(--accent); color: black; border: none; padding: 3px 10px; border-radius: 3px; font-size: 9.5px; font-weight: bold; cursor: pointer; }
				.action-btn:hover { opacity: 0.8; }
				.action-btn.secondary { background: rgba(255,255,255,0.1); color: var(--text); }
				.reason-badge { position: absolute; top: 2px; right: 3px; font-size: 7px; opacity: 0.5; background: rgba(0,0,0,0.4); padding: 1px 5px; border-radius: 2px; font-weight: bold; }
				
				.vault-toolbar { display: flex; align-items: center; border-bottom: 1px solid var(--card-border); background: var(--bg); height: 26px; padding: 0 4px; flex-shrink: 0; justify-content: space-between; gap: 4px; }
				.tabs { display: flex; overflow-x: auto; gap: 4px; padding: 0 4px; flex: 1; font-size: 11px; scrollbar-width: none; align-items: center; height: 100%; scroll-behavior: smooth; }
				.tabs::-webkit-scrollbar { display: none; }
				.scroll-btn { cursor: pointer; opacity: 0.4; font-size: 10px; padding: 0 2px; user-select: none; transition: 0.2s; display: flex; align-items: center; }
				.scroll-btn:hover { opacity: 1; color: var(--accent); }
				.tab { padding: 2px 8px; cursor: pointer; opacity: 0.5; border-radius: 3px; white-space: nowrap; height: 20px; line-height: 14px; transition: 0.2s; border: 1px solid transparent; display: flex; align-items: center; flex-shrink: 0; }
				.tab:hover { opacity: 0.8; }
				.tab.active { opacity: 1; background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); font-weight: 600; }
				

				.nav-groups { display: flex; border-bottom: 1px solid var(--card-border); background: var(--bg); height: 26px; z-index: 5; position: relative; }
				.nav-group-btn { flex: 1; border: none; background: transparent; color: var(--text); font-size: 10px; font-weight: bold; cursor: pointer; opacity: 0.6; transition: 0.2s; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 4px; border-right: 1px solid var(--card-border); }
				.nav-group-btn:last-child { border-right: none; }
				.nav-group-btn:hover { opacity: 1; background: rgba(255,255,255,0.02); }
				.nav-group-btn.active { opacity: 1; color: var(--accent); background: var(--accent-dim); }
				
				.dropdown-menu { position: absolute; top: 26px; left: 0; width: 100%; background: var(--card-bg); border-bottom: 1px solid var(--card-border); z-index: 100; display: none; grid-template-columns: repeat(2, 1fr); padding: 4px; gap: 2px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
				.dropdown-menu.show { display: grid; }
				.dropdown-item { padding: 6px 10px; cursor: pointer; font-size: 11px; color: var(--text); opacity: 0.8; border-radius: 3px; display: flex; align-items: center; gap: 6px; }
				.dropdown-item:hover { background: rgba(255,255,255,0.1); opacity: 1; color: var(--accent); }
				.dropdown-item.active { background: var(--accent-dim); color: var(--accent); font-weight: bold; opacity: 1; }

				.config-panel { display: none; background: var(--card-bg); border-bottom: 1px solid var(--card-border); padding: 4px 8px; flex-shrink: 0; flex-direction: column; gap: 2px; }
				.config-panel.show { display: flex; }
				.section-toggles { display: flex; gap: 4px; flex-wrap: wrap; }
				.sec-toggle { background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: var(--text); padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px; height: 20px; }
				.sec-toggle:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
				.sec-toggle.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
				.collapsible-sec { padding: 4px 0; border-top: 1px solid var(--card-border); margin-top: 0px; }
				.config-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; }
				
				.conf-group { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
				.conf-lbl { font-size: 9.5px; opacity: 0.7; white-space: nowrap; font-weight: 600; }
				
				.modifiers-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 100%; }
				.mod-item { display: flex; flex-direction: row; align-items: center; gap: 4px; }
				.mod-separator { display: none; }
				.mod-label { font-size: 9px; text-transform: uppercase; color: #fff; opacity: 0.9; display: flex; align-items: center; gap: 3px; cursor: pointer; user-select: none; font-weight: 600; white-space: nowrap; }
				.mod-label:hover { opacity: 1; }
				.mod-label input { width: 10px; height: 10px; margin: 0; cursor: pointer; }
				.mod-item select, .mod-select { background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text); font-size: 9.5px; padding: 0 4px; height: 20px; outline: none; width: 100%; min-width: 0; border-radius: 3px; cursor: pointer; opacity: 0.8; }
				.mod-select { width: auto; min-width: 70px; max-width: 90px; text-overflow: ellipsis; }
				.mod-item select:focus, .mod-select:focus { border-color: var(--accent); color: var(--accent); opacity: 1; }
				
				.modes-bar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; flex-shrink: 0; align-items: center; width: 100%; }
				.mode-btn { border: 1px solid var(--card-border); padding: 0 4px; text-align: center; cursor: pointer; font-size: 8.5px; border-radius: 4px; opacity: 0.5; transition: 0.2s; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 4px; height: 18px; background: rgba(255,255,255,0.02); overflow: hidden; }
				.mode-btn:hover { opacity: 0.9; background: rgba(255,255,255,0.05); }
				.mode-btn.active { opacity: 1; border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
				.mode-btn span { font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 7.5px; }
				
				.action-pill { background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: var(--text); padding: 4px 10px; border-radius: 4px; font-size: 9px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px; }
				.action-pill:hover { background: rgba(255,255,255,0.1); border-color: var(--accent); color: var(--accent); }
				.action-pill.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
				
				.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: none; align-items: center; justify-content: center; z-index: 1000; padding: 24px; backdrop-filter: blur(3px); }
				.modal.show { display: flex; }
				.modal-box { background: var(--card-bg); border: 1px solid var(--accent); padding: 18px; border-radius: 8px; width: 100%; max-width: 250px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 15px 40px rgba(0,0,0,0.6); }
				.modal-title { font-size: 13px; font-weight: bold; color: var(--accent); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1.2px; }
				.modal-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
				.modal-item { display: flex; align-items: center; gap: 10px; font-size: 11px; cursor: pointer; padding: 5px 8px; border-radius: 4px; transition: 0.1s; border: 1px solid transparent; }
				.modal-item:hover { background: var(--accent-dim); border-color: var(--accent); }
				.modal-btns { display: flex; gap: 8px; margin-top: 8px; }
				.modal-btn { flex: 1; background: var(--accent); color: black; border: none; padding: 8px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; text-transform: uppercase; }
				.modal-btn.cancel { background: rgba(255,255,255,0.1); color: var(--text); }
				.toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: var(--accent); color: black; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 11px; opacity: 0; transition: 0.3s; z-index: 10000; pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
				.toast.show { opacity: 1; }
				.empty-msg { width: 100%; text-align: center; padding: 20px; opacity: 0.3; font-style: italic; font-size: 10px; }
			</style>
		</head><body>
			<div class="content-area" id="main-scroll">
				<div class="search-toolbar">
					<input type="text" id="search-in" class="search-input" placeholder="Search prompts..." oninput="render()">
					<div class="pred-label">🔮 PREDICTED</div>
					<div class="gen-btn" onclick="toggleConfig()" title="Toggle Settings Panel">⚙️ SETTINGS</div>
				</div>
				
				<div id="config-panel" class="config-panel">
					<div class="section-toggles">
						<button class="sec-toggle" onclick="toggleSection('style')" id="tog-style" title="Tone, Size, Sort">📝 Style</button>
						<button class="sec-toggle" onclick="toggleSection('mods')" id="tog-mods" title="Language, Stack, Focus, Style modifiers">🔧 Modifiers</button>
						<button class="sec-toggle" onclick="toggleSection('modes')" id="tog-modes" title="AI Mode: Discuss, Implement, etc.">🎯 Modes</button>
						<button class="sec-toggle" onclick="toggleSection('actions')" id="tog-actions" title="Stats, Export, Import, Multi-select">⚡ Actions</button>
					</div>
					
					<div id="sec-style" class="collapsible-sec" style="display:none;">
						<div class="config-row">
							<div class="conf-group">
								<span class="conf-lbl">Tone:</span>
								<select id="sel-attitude" class="mod-select" onchange="upSet()">
									<option value="Pro">Professional</option>
									<option value="Casual">Casual</option>
									<option value="Socratic">Socratic</option>
									<option value="Direct">Direct</option>
									<option value="Genius">Genius</option>
								</select>
							</div>
							<div class="conf-group">
								<span class="conf-lbl">Size:</span>
								<select id="sel-length" class="mod-select" onchange="upSet()">
									<option value="Short">Concise</option>
									<option value="Med">Balanced</option>
									<option value="Long">Detailed</option>
									<option value="Bullet">Bullets</option>
								</select>
							</div>
							<div class="conf-group">
								<span class="conf-lbl">Sort:</span>
								<select id="sort-sel" class="mod-select" onchange="upSet()">
									<option value="def">Default</option>
									<option value="pred">Predicted</option>
									<option value="az">A-Z</option>
									<option value="use">Usage</option>
									<option value="new">Recent</option>
								</select>
							</div>
						</div>
					</div>
					
					<div id="sec-mods" class="collapsible-sec" style="display:none;">
						<div class="modifiers-row">
							<div class="mod-item">
								<label class="mod-label"><input type="checkbox" id="chk-l" onchange="up()"> Lang</label>
								<select id="sel-l" onchange="up()"></select>
							</div>
							<div class="mod-item">
								<label class="mod-label"><input type="checkbox" id="chk-s" onchange="up()"> Stack</label>
								<select id="sel-s" onchange="up()"></select>
							</div>
							<div class="mod-item">
								<label class="mod-label"><input type="checkbox" id="chk-f" onchange="up()"> Focus</label>
								<select id="sel-f" onchange="up()"></select>
							</div>
							<div class="mod-item">
								<label class="mod-label"><input type="checkbox" id="chk-y" onchange="up()"> Style</label>
								<select id="sel-y" onchange="up()"></select>
							</div>
						</div>
					</div>
					
					<div id="sec-modes" class="collapsible-sec" style="display:none;">
						<div class="modes-bar" id="modes"></div>
					</div>
					
					<div id="sec-actions" class="collapsible-sec" style="display:none;">
						<div class="config-row" style="flex-wrap: wrap;">
							<button class="action-pill" onclick="vscode.postMessage({type:'showAnalytics'})" title="View usage statistics">📊 Stats</button>
							<button class="action-pill" onclick="vscode.postMessage({type:'export'})" title="Export prompts to JSON">📤 Export</button>
							<button class="action-pill" onclick="vscode.postMessage({type:'import'})" title="Import prompts from JSON">📥 Import</button>
							<button class="action-pill" id="btn-save" style="display:none;" onclick="openModal()" title="Save selected prompts to category">💾 Save</button>
							<button class="action-pill" id="btn-del" style="display:none;" onclick="doDelete()" title="Delete selected prompts">🗑️ Delete</button>
						</div>
						<div class="config-row" style="margin-top:8px; border-top: 1px solid var(--card-border); padding-top: 8px;">
							<div class="conf-group">
								<span class="conf-lbl" title="Where Ctrl+Click sends the prompt">Turbo Target:</span>
								<select id="sel-turbo" class="mod-select" onchange="upSet()" style="min-width:100px;">
									<option value="cursor" title="Send to Cursor AI chat">Cursor</option>
									<option value="copilot" title="Send to GitHub Copilot chat">Copilot</option>
									<option value="cody" title="Send to Sourcegraph Cody">Cody</option>
									<option value="editor" title="Insert at cursor in editor">Editor</option>
									<option value="clipboard" title="Copy to clipboard only">Clipboard</option>
								</select>
							</div>
							<label class="mod-label" title="Auto-paste to focused chat input if detected">
								<input type="checkbox" id="chk-smart" onchange="upSet()"> Smart Inject
							</label>
						</div>
					</div>
				</div>
				
				<div class="pred-sec">
					<div class="grid-container" id="pred-container"><div class="prompt-grid" id="pred-grid"></div></div>
				</div>
				<div class="vault-sec">
						<div class="nav-groups">
							<button class="nav-group-btn" id="grp-build" onclick="toggleGroup('build')">🏗️ BUILD</button>
							<button class="nav-group-btn" id="grp-quality" onclick="toggleGroup('quality')">🛡️ QUALITY</button>
							<button class="nav-group-btn" id="grp-ops" onclick="toggleGroup('ops')">🚢 OPS</button>
							<button class="nav-group-btn" id="grp-gen" onclick="toggleGroup('generated')">🤖 GEN</button>
						</div>
						<div class="dropdown-menu" id="dropdown"></div>
						<div class="header-btns" style="display:flex; justify-content: space-between; padding: 2px 4px; border-bottom: 1px solid var(--card-border); background: var(--bg);">
							<div style="font-size: 10px; opacity: 0.5; padding-left: 4px; display:flex; align-items:center;" id="current-cat-label">ALL</div>
							<div style="display:flex; gap: 4px;">
								<span class="header-btn" id="btn-ctrl" onclick="toggleCtrl()" title="Enable Selection Mode">☑️</span>
								<span class="header-btn" onclick="vscode.postMessage({type:'addCat'})" title="Add Category">➕</span>
								<span class="header-btn" onclick="openGenModal()" title="AI Generate Prompts" style="opacity: 0.8; font-size: 11px;">✨</span>
							</div>
						</div>
					<div class="grid-container" id="vault-container">
						<div class="prompt-grid" id="vault-grid"></div>
					</div>
				</div>
			</div>
			<div id="modal" class="modal">
				<div class="modal-box">
					<div class="modal-title">Save to Sections</div>
					<div class="modal-list" id="modal-list"></div>
					<div class="modal-btns">
						<button class="modal-btn" onclick="doSave()">Save</button>
						<button class="modal-btn cancel" onclick="closeModal()">Cancel</button>
					</div>
				</div>
			</div>

			<div id="gen-modal" class="modal">
				<div class="modal-box" style="max-width:350px;">
					<div class="modal-title">Generate Prompts</div>
					<div style="display:flex; flex-direction:column; gap:8px;">
						<input id="gen-name" class="search-input" style="height:26px;" placeholder="Name (e.g. API Helpers)">
						<textarea id="gen-prompt" class="search-input" style="height:60px; resize:vertical; padding:6px; font-family:inherit;" placeholder="Describe what you need..."></textarea>
						
						<div style="display:flex; gap:10px; align-items:center;">
							<label style="font-size:10px; font-weight:600;">Count:</label>
							<input id="gen-count" type="number" min="5" max="50" value="25" class="search-input" style="width:50px;">
							<span style="font-size:9px; opacity:0.5;">(5-50)</span>
						</div>

						<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; background:rgba(255,255,255,0.03); padding:6px; border-radius:4px;">
							<div style="grid-column: span 2;">
								<label style="font-size:9px; font-weight:600;">Role / Persona:</label>
								<input id="gen-role" class="search-input" placeholder="e.g. Senior Architect..." style="width:100%">
							</div>
							<div>
								<label style="font-size:9px; font-weight:600;">Intent:</label>
								<select id="gen-intent" class="mod-select" style="width:100% !important; max-width:none;">
									<option value="General">General</option>
									<option value="Debugging">Debugging</option>
									<option value="Refactoring">Refactoring</option>
									<option value="Architecture">Architecture</option>
									<option value="Testing">Testing</option>
									<option value="Security">Security</option>
									<option value="Documentation">Documentation</option>
								</select>
							</div>
							<div>
								<label style="font-size:9px; font-weight:600;">Difficulty:</label>
								<select id="gen-diff" class="mod-select" style="width:100% !important; max-width:none;">
									<option value="Beginner">Beginner</option>
									<option value="Intermediate" selected>Intermediate</option>
									<option value="Advanced">Advanced</option>
									<option value="Expert">Expert</option>
								</select>
							</div>
						</div>
						
						<div class="modal-btns">
							<button class="modal-btn" onclick="submitGen()">Generate</button>
							<button class="modal-btn cancel" onclick="closeGen()">Cancel</button>
						</div>
					</div>
				</div>
			</div>

			<div id="toast" class="toast"></div>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
				let data = null, predPrompts = [], activeTab = 'all', expId = null, expSection = null;
				let expTimer = null, isCtrl = false, selectedIds = new Set();
                let focusedIdx = -1;
				let activeGroup = null;

				const groups = {
					build: ['planning', 'creativity', 'building', 'database', 'ai'],
					quality: ['refine', 'bugs', 'assurance', 'hardening'],
					ops: ['ship', 'github', 'docs', 'utilities'],
					generated: ['generated', 'recent', 'pinned', 'suggested', 'playbooks']
				};

				let configOpen = false;
				let openSections = { style: false, mods: false, modes: false, actions: false };
				
				function toggleConfig() {
					configOpen = !configOpen;
					const panel = document.getElementById('config-panel');
					if(panel) panel.classList.toggle('show', configOpen);
					
					// Make content scrollable when settings open
					const main = document.getElementById('main-scroll');
					if(main) main.style.overflow = configOpen ? 'auto' : 'hidden';
				}
				
				function toggleSection(id) {
					openSections[id] = !openSections[id];
					const sec = document.getElementById('sec-' + id);
					const tog = document.getElementById('tog-' + id);
					if(sec) sec.style.display = openSections[id] ? 'block' : 'none';
					if(tog) tog.classList.toggle('active', openSections[id]);
				}


				function toggleGroup(grp) {
					const dd = document.getElementById('dropdown');
					if (activeGroup === grp && dd.classList.contains('show')) {
						dd.classList.remove('show');
						activeGroup = null;
						renderNav();
						return;
					}
					
					activeGroup = grp;
					renderNav();
					
					// Render dropdown content
					const cats = data.categories || [];
					let items = [];
					
					if (grp === 'generated') {
						// Special handling for Generated/Meta group
						const metaMap = {
							'generated': {name: 'Generated', icon: '🤖'},
							'recent': {name: 'Recent', icon: '🕒'},
							'pinned': {name: 'Pinned', icon: '📌'},
							'suggested': {name: 'Suggested', icon: '✨'},
							'playbooks': {name: 'Playbooks', icon: '📚'}
						};
						items = groups[grp].map(g => ({id: g, ...metaMap[g] }));
					} else {
						// Filter categories that match the group list
						items = groups[grp].map(id => cats.find(c => c.id === id)).filter(Boolean);
					}

					dd.innerHTML = items.map(c => 
						\`<div class="dropdown-item \${activeTab === c.id ? 'active' : ''}" onclick="selectCat('\${c.id}')">\${c.icon || ''} \${c.name}</div>\`
					).join('');
					
					dd.classList.add('show');
				}

				function selectCat(id) {
					activeTab = id;
					document.getElementById('dropdown').classList.remove('show');
					activeGroup = null; // Close dropdown
					renderNav();
					render();
				}

				function renderNav() {
					['build', 'quality', 'ops', 'gen'].forEach(g => {
						const btn = document.getElementById('grp-' + g);
						const bg = g === 'gen' ? 'generated' : g;
						// Highlight if dropdown open OR if active tab is inside this group
						const isActive = (activeGroup === bg) || (groups[bg] && groups[bg].includes(activeTab));
						if(btn) btn.classList.toggle('active', isActive);
					});
					
					// Update label
					let label = 'ALL';
					if (activeTab === 'all') label = 'ALL PROMPTS';
					else if (['recent','pinned','suggested','playbooks','generated'].includes(activeTab)) {
						label = activeTab.toUpperCase();
					} else {
						const cat = (data.categories || []).find(c => c.id === activeTab);
						if (cat) label = cat.name.toUpperCase();
					}
					const lblEl = document.getElementById('current-cat-label');
					if(lblEl) lblEl.innerText = label;
				}

				function render() {
					if(!data) return;
					const search = (document.getElementById('search-in')?.value || '').toLowerCase();
					
                    const cats = data.categories || [];
					renderNav();

					renderGrid('pred-grid', (predPrompts || []).filter(p => (p.title+p.prompt).toLowerCase().includes(search)), true, 'pred');
					
					let vp = [];
                    const allP = cats.flatMap(c => c.prompts || []);
                    const sugP = data.suggested || [];
                    const playP = data.playbooks || [];
                    const sourceP = [...allP, ...sugP, ...playP];

					if(activeTab === 'all') vp = [...allP];
                    else if(activeTab === 'recent') vp = (data.recentlyUsedIds || []).map(id => sourceP.find(x => x.id === id)).filter(Boolean);
                    else if(activeTab === 'pinned') vp = (data.pinnedIds || []).map(id => allP.find(x => x.id === id)).filter(Boolean);
					else if(activeTab === 'playbooks') vp = [...playP];
					else if(activeTab === 'suggested') vp = [...sugP];
					else vp = [...(cats.find(c => c.id === activeTab)?.prompts || [])];

const sType = document.getElementById('sort-sel')?.value || 'def';
if (sType === 'az') vp.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
if (sType === 'use') vp.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
if (sType === 'new') vp.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
if (sType === 'pred') {
    const now = Date.now();
    vp.sort((a, b) => {
        const scoreA = ((a.usageCount || 0) * 10) + Math.max(0, 20 - ((now - (a.lastUsed || 0)) / 3600000)) + (data.pinnedIds.includes(a.id) ? 50 : 0);
        const scoreB = ((b.usageCount || 0) * 10) + Math.max(0, 20 - ((now - (b.lastUsed || 0)) / 3600000)) + (data.pinnedIds.includes(b.id) ? 50 : 0);
        return scoreB - scoreA;
    });
}

const filtered = vp.filter(p => (p.title + p.prompt).toLowerCase().includes(search));
renderGrid('vault-grid', filtered, false, 'vault');

const modesEl = document.getElementById('modes');
if (modesEl) modesEl.innerHTML = (data.modes || []).map(m => \`<div class="mode-btn \${data.activeModeId === m.id ? 'active' : ''}" onclick="vscode.postMessage({type:'setMode',id:'\${m.id}'})">\${m.icon} <span>\${m.name}</span></div>\`).join('');
					
					const vCont = document.getElementById('vault-container');
					if(vCont) {
                        if(isCtrl) vCont.classList.add('ctrl-mode'); else vCont.classList.remove('ctrl-mode');
                    }
					const btnSave = document.getElementById('btn-save'); if(btnSave) btnSave.style.display = isCtrl ? 'flex' : 'none';
					const btnDel = document.getElementById('btn-del'); if(btnDel) btnDel.style.display = isCtrl ? 'flex' : 'none';
					
                    const btnCtrl = document.getElementById('btn-ctrl'); 
                    if(btnCtrl) {
                        btnCtrl.classList.toggle('active', isCtrl);
                        btnCtrl.style.opacity = isCtrl ? '1' : '0.7';
                        btnCtrl.style.color = isCtrl ? 'var(--accent)' : 'inherit';
                    }
					
					const panel = document.getElementById('config-panel');
					if(panel) panel.classList.toggle('show', configOpen);
				}

				function renderGrid(elId, prompts, showReason, section) {
					const el = document.getElementById(elId);
					if(!el) return;
                    if(prompts.length === 0) { el.innerHTML = '<div class="empty-msg">No prompts found here.</div>'; return; }
					el.innerHTML = prompts.map((p, i) => {
						const isExp = (expId === p.id && expSection === section);
						const isSel = selectedIds.has(p.id);
                        const isPinned = data.pinnedIds.includes(p.id);
						const reason = (showReason && p.reason) ? \`<span class="reason-badge">\${p.reason}</span>\` : '';
                        const idTag = section === 'vault' ? \`id="card-\${i}"\` : '';
						return \`<div \${idTag} class="prompt-card \${isExp ? 'expanded' : ''} \${isSel ? 'selected' : ''} \${isPinned ? 'pinned' : ''}" 
                            tabindex="0"
                            onclick="handleCard(event,'\${p.id}','\${section}')" 
                            ondblclick="handleDblClick(event,'\${p.id}')">
							<input type="checkbox" class="card-check" \${isSel ? 'checked' : ''} onchange="toggleSelect('\${p.id}')">
							\${reason}
							<div class="prompt-title" title="\${p.title}">\${p.title}</div>
							<div class="prompt-content">\${p.prompt}</div>
							<div class="card-actions">
								<button class="action-btn" onclick="handleAction(event, '\${p.id}', false)">Copy & Insert</button>
								<button class="action-btn" onclick="handleAction(event, '\${p.id}', true)">To Chat</button>
                                <button class="action-btn secondary" onclick="handlePin(event, '\${p.id}')">\${isPinned ? 'Unpin' : 'Pin'}</button>
                                <button class="action-btn secondary" onclick="handleEdit(event, '\${p.id}')">Edit</button>
							</div>
						</div>\`;
					}).join('');
				}

				function toggleCtrl() { isCtrl = !isCtrl; if(!isCtrl) selectedIds.clear(); render(); }
				function toggleSelect(id) { if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); render(); }
				function handlePin(e, id) { e.stopPropagation(); vscode.postMessage({type:'togglePin', id}); }
                function handleEdit(e, id) { e.stopPropagation(); vscode.postMessage({type:'editPrompt', id}); }

				function openModal() {
					const list = document.getElementById('modal-list');
					list.innerHTML = data.categories.map(c => \`
						<div class="modal-item" onclick="const ck=this.querySelector('input'); ck.checked=!ck.checked; event.stopPropagation();">
							<input type="checkbox" value="\${c.id}" onclick="event.stopPropagation()">
							<span>\${c.name}</span>
						</div>\`).join('');
					document.getElementById('modal').classList.add('show');
				}
				function closeModal() { document.getElementById('modal').classList.remove('show'); }

				function doSave() {
					const catIds = Array.from(document.querySelectorAll('#modal-list input:checked')).map(i => i.value);
					if(catIds.length && selectedIds.size) {
						vscode.postMessage({ type: 'saveTo', promptIds: Array.from(selectedIds), catIds });
						isCtrl = false; selectedIds.clear(); closeModal();
					}
				}

				function openGenModal() { document.getElementById('gen-modal').classList.add('show'); document.getElementById('gen-prompt').focus(); }
				function closeGen() { document.getElementById('gen-modal').classList.remove('show'); }
				function submitGen() {
					const name = document.getElementById('gen-name').value || 'Generated';
					const prompt = document.getElementById('gen-prompt').value;
					const count = parseInt(document.getElementById('gen-count').value || '25');
					const role = document.getElementById('gen-role').value;
					const intent = document.getElementById('gen-intent').value;
					const diff = document.getElementById('gen-diff').value;
					if(!prompt) { closeGen(); return; }
					vscode.postMessage({ type:'aiGen', name, prompt, count, context: { role, intent, difficulty: diff } });
					closeGen();
				}

				function doDelete() {
					if(selectedIds.size) {
						vscode.postMessage({ type: 'deletePrompts', promptIds: Array.from(selectedIds), activeTab });
						selectedIds.clear();
					}
				}

				function handleCard(e, id, section) {
					if(isCtrl && section === 'vault') { toggleSelect(id); return; }
					if(e.ctrlKey || e.metaKey) { vscode.postMessage({type:'promptClick',id,ctrl:true}); return; }
                    if(e.target.tagName === 'BUTTON' || e.target.classList.contains('card-check')) return;
					if(expId === id && expSection === section) { expId = null; expSection = null; render(); return; }
					expId = id; expSection = section;
					render();
					if(expTimer) clearTimeout(expTimer);
					expTimer = setTimeout(() => { if(expId === id) { expId = null; expSection = null; render(); } }, 15000);
				}

				function handleDblClick(e, id) { if(expId === id) vscode.postMessage({type:'copy', id}); }
                function handleAction(e, id, toChat) { e.stopPropagation(); vscode.postMessage({type:'promptClick', id, ctrl: toChat}); }

				document.addEventListener('mousedown', (e) => {
					if(!e.target.closest('.prompt-card') && expId) { expId = null; expSection = null; if(expTimer) clearTimeout(expTimer); render(); }
				});

                document.addEventListener('keydown', (e) => {
                    const cards = document.querySelectorAll('#vault-grid .prompt-card');
                    if(e.key === 'ArrowRight') { focusedIdx = Math.min(focusedIdx + 1, cards.length - 1); cards[focusedIdx]?.focus(); e.preventDefault(); }
                    if(e.key === 'ArrowLeft') { focusedIdx = Math.max(focusedIdx - 1, 0); cards[focusedIdx]?.focus(); e.preventDefault(); }
                    if(e.key === 'Enter' && focusedIdx >= 0) { cards[focusedIdx].click(); e.preventDefault(); }
                    if(e.key === 'Tab') {
                        const tabs = Array.from(document.querySelectorAll('#tabs .tab'));
                        let cur = tabs.findIndex(t => t.classList.contains('active'));
                        let next = (cur + 1) % tabs.length;
                        tabs[next].click();
                        e.preventDefault();
                    }
                });

				function up() { 
					const l = document.getElementById('sel-l').value;
					const s = document.getElementById('sel-s').value;
					const f = document.getElementById('sel-f').value;
					const y = document.getElementById('sel-y').value;
					if(l === 'add-new') { vscode.postMessage({type:'addCustom', cat:'Language'}); return; }
					if(s === 'add-new') { vscode.postMessage({type:'addCustom', cat:'Stack'}); return; }
					if(f === 'add-new') { vscode.postMessage({type:'addCustom', cat:'Focus'}); return; }
					if(y === 'add-new') { vscode.postMessage({type:'addCustom', cat:'Style'}); return; }
					const set = { 
						selectedContext: {
                            language: l, framework: s, focus: f, style: y,
                            toggles: {
                                l: document.getElementById('chk-l').checked,
                                s: document.getElementById('chk-s').checked,
                                f: document.getElementById('chk-f').checked,
                                y: document.getElementById('chk-y').checked
                            }
                        }
					};
					vscode.postMessage({type:'upSettings', s: set});
				}

                function upSet() {
                    const set = {
                        sortType: document.getElementById('sort-sel')?.value || 'def',
                        attitude: document.getElementById('sel-attitude')?.value || 'Pro',
                        responseLength: document.getElementById('sel-length')?.value || 'Short',
                        turboTarget: document.getElementById('sel-turbo')?.value || 'cursor',
                        smartInject: document.getElementById('chk-smart')?.checked || false
                    };
                    vscode.postMessage({type:'upSettings', s: set});
                }

				window.addEventListener('message', e => {
					if(e.data.type === 'update') {
						data = e.data.data; predPrompts = e.data.predicted;
						const ctx = data.settings.selectedContext || {};
						const tg = ctx.toggles || {l:true, s:true, f:true, y:true};
                        
                        document.getElementById('sel-attitude').value = data.settings.attitude || 'Pro';
                        document.getElementById('sel-length').value = data.settings.responseLength || 'Short';
                        document.getElementById('sort-sel').value = data.settings.sortType || 'def';
                        
                        // Turbo settings
                        const turboEl = document.getElementById('sel-turbo');
                        if(turboEl) turboEl.value = data.settings.turboTarget || 'cursor';
                        const smartEl = document.getElementById('chk-smart');
                        if(smartEl) smartEl.checked = data.settings.smartInject !== false;
						
						const fill = (id, vals, curr) => {
							const el = document.getElementById(id);
							el.innerHTML = vals.map(v => \`<option value="\${v}">\${v}</option>\`).join('') + '<option value="add-new">+ Add New...</option>';
							el.value = curr || vals[0] || '';
						};
						fill('sel-l', data.customLanguages, ctx.language);
						fill('sel-s', data.customStacks, ctx.framework);
						fill('sel-f', data.customFocuses, ctx.focus);
						fill('sel-y', data.customStyles, ctx.style);
						document.getElementById('chk-l').checked = tg.l;
						document.getElementById('chk-s').checked = tg.s;
						document.getElementById('chk-f').checked = tg.f;
						document.getElementById('chk-y').checked = tg.y;
						render();
					}
					if(e.data.type === 'doTab') { activeTab = e.data.id; render(); }
					if(e.data.type === 'toast') { const t = document.getElementById('toast'); t.innerText = e.data.msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }
				});
			</script>
		</body></html>`;
    }
}

function getNonce() {
    let t = ''; const p = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) t += p.charAt(Math.floor(Math.random() * p.length));
    return t;
}

export function activate(context: vscode.ExtensionContext) {
    const manager = new BriskliDataManager(context.extensionUri, context.globalState);
    const provider = new BriskliViewProvider(context.extensionUri, manager);

    // Initial tracking
    if (vscode.window.activeTextEditor) {
        manager.trackEditorChange(vscode.window.activeTextEditor);
        manager.trackDiagnosticsChange(vscode.window.activeTextEditor);
    }

    const reg = (id: string, topic: string) => vscode.commands.registerCommand(id, () => provider.handleAiGen(topic));
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(BriskliViewProvider.viewType, provider),
        reg('briskli.genOptimize', 'Selection Optimize'),
        reg('briskli.genSecure', 'Selection Security'),
        reg('briskli.genDocs', 'Selection Documentation'),
        reg('briskli.generatePrompts', 'AI Assistance'),
        vscode.window.onDidChangeActiveTextEditor(e => { if (e) { manager.trackEditorChange(e); manager.trackDiagnosticsChange(e); provider.updateWebview(); } }),
        vscode.window.onDidChangeTextEditorSelection(() => provider.updateWebview()),
        vscode.workspace.onDidChangeTextDocument(e => { manager.trackDocumentChange(e); provider.updateWebview(); }),
        vscode.languages.onDidChangeDiagnostics(() => { manager.trackDiagnosticsChange(vscode.window.activeTextEditor); provider.updateWebview(); })
    );
}

export function deactivate() { }
