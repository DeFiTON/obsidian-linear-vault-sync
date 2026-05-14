import { Notice, Plugin, TFile } from "obsidian";
import { LinearClient } from "./src/linear-client";
import { SyncEngine } from "./src/sync-engine";
import { LinearVaultSyncSettingTab } from "./src/settings";
import {
	DEFAULT_SETTINGS,
	FM_KEYS,
	SYNC_ENABLED_VALUE,
	type PluginSettings,
} from "./src/types";

export default class LinearVaultSyncPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private client: LinearClient | null = null;
	private engine: SyncEngine | null = null;
	private autoSyncTimer: number | null = null;
	private statusBarEl: HTMLElement | null = null;
	private fileSyncDebounce = new Map<string, number>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.rebuildClient();

		this.addSettingTab(new LinearVaultSyncSettingTab(this.app, this));

		this.statusBarEl = this.addStatusBarItem();
		this.renderStatusBar("idle");

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => this.runSyncCommand(),
		});

		this.addCommand({
			id: "enable-on-current-note",
			name: "Enable sync on current note",
			editorCheckCallback: (checking, _editor, ctx) => {
				const file = ctx.file;
				if (!file) return false;
				if (checking) return true;
				void this.toggleSyncOnFile(file, true);
				return true;
			},
		});

		this.addCommand({
			id: "disable-on-current-note",
			name: "Disable sync on current note",
			editorCheckCallback: (checking, _editor, ctx) => {
				const file = ctx.file;
				if (!file) return false;
				if (checking) return true;
				void this.toggleSyncOnFile(file, false);
				return true;
			},
		});

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!this.settings.syncOnSave) return;
				if (!(file instanceof TFile)) return;
				if (file.extension !== "md") return;
				this.queueDebouncedFileSync(file);
			}),
		);

		this.restartAutoSync();
	}

	onunload(): void {
		if (this.autoSyncTimer !== null) {
			window.clearInterval(this.autoSyncTimer);
			this.autoSyncTimer = null;
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	rebuildClient(): void {
		if (!this.settings.apiKey) {
			this.client = null;
			this.engine = null;
			return;
		}
		this.client = new LinearClient(this.settings.apiKey);
		this.engine = new SyncEngine(
			this.app,
			this.settings,
			this.client,
			(msg, ...rest) => {
				if (this.settings.debugLogging) {
					console.log("[Linear Vault Sync]", msg, ...rest);
				}
			},
		);
	}

	restartAutoSync(): void {
		if (this.autoSyncTimer !== null) {
			window.clearInterval(this.autoSyncTimer);
			this.autoSyncTimer = null;
		}
		if (!this.settings.autoSync) return;
		const intervalMs = Math.max(1, this.settings.syncIntervalMinutes) * 60_000;
		this.autoSyncTimer = window.setInterval(() => {
			void this.runSyncCommand({ silent: true });
		}, intervalMs);
	}

	private async runSyncCommand(opts: { silent?: boolean } = {}): Promise<void> {
		if (!this.engine) {
			if (!opts.silent) new Notice("Linear Vault Sync: API key not configured");
			return;
		}
		this.renderStatusBar("syncing");
		try {
			const result = await this.engine.runFullSync();
			this.renderStatusBar("idle");
			if (!opts.silent) {
				new Notice(
					`Linear Vault Sync: pushed ${result.pushed}, pulled ${result.pulled}, errors ${result.errors}`,
				);
			}
		} catch (err) {
			this.renderStatusBar("error");
			new Notice(`Linear Vault Sync: sync failed (${String(err)})`);
		}
	}

	private async toggleSyncOnFile(file: TFile, enable: boolean): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (enable) {
				fm[FM_KEYS.sync] = SYNC_ENABLED_VALUE;
			} else {
				delete fm[FM_KEYS.sync];
			}
		});
		new Notice(
			`Linear Vault Sync: sync ${enable ? "enabled" : "disabled"} on ${file.basename}`,
		);
	}

	private queueDebouncedFileSync(file: TFile): void {
		const existing = this.fileSyncDebounce.get(file.path);
		if (existing !== undefined) window.clearTimeout(existing);
		const handle = window.setTimeout(() => {
			this.fileSyncDebounce.delete(file.path);
			void this.engine?.syncSingleFile(file);
		}, 2500);
		this.fileSyncDebounce.set(file.path, handle);
	}

	private renderStatusBar(state: "idle" | "syncing" | "error"): void {
		if (!this.statusBarEl) return;
		this.statusBarEl.empty();
		const wrap = this.statusBarEl.createSpan({ cls: "lvs-status-bar" });
		const dot = wrap.createSpan({ cls: "lvs-status-badge" });
		if (state === "syncing") {
			dot.addClass("lvs-status-badge--pending");
			dot.setText("Linear Vault Sync: syncing…");
		} else if (state === "error") {
			dot.addClass("lvs-status-badge--error");
			dot.setText("Linear Vault Sync: error");
		} else {
			dot.addClass("lvs-status-badge--synced");
			dot.setText("Linear Vault Sync");
		}
	}
}
