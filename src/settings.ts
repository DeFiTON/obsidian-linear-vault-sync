import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	type DropdownComponent,
} from "obsidian";
import type LinearVaultSyncPlugin from "../main";
import { LinearClient, LinearApiError } from "./linear-client";

export class LinearVaultSyncSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: LinearVaultSyncPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Linear Vault Sync" });
		containerEl.createEl("p", {
			text: "Privacy-first two-way sync with Linear. Notes are only mirrored when their frontmatter contains 'linear-sync: enabled'.",
			cls: "lvs-settings-hint",
		});

		new Setting(containerEl)
			.setName("Linear API key")
			.setDesc("Get one from Linear → Settings → API → Personal API keys.")
			.addText((text) =>
				text
					.setPlaceholder("lin_api_...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
						this.plugin.rebuildClient();
					}),
			);

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify the API key and fetch your Linear profile.")
			.addButton((btn) =>
				btn.setButtonText("Test").onClick(async () => {
					if (!this.plugin.settings.apiKey) {
						new Notice("Linear Vault Sync: enter an API key first");
						return;
					}
					try {
						const client = new LinearClient(this.plugin.settings.apiKey);
						const viewer = await client.getViewer();
						new Notice(`Linear Vault Sync: connected as ${viewer.name}`);
					} catch (err) {
						const msg =
							err instanceof LinearApiError ? err.message : String(err);
						new Notice(`Linear Vault Sync: ${msg}`);
					}
				}),
			);

		const teamSetting = new Setting(containerEl)
			.setName("Default team")
			.setDesc(
				"Notes without an explicit 'linear-team' frontmatter will be synced here.",
			);
		let teamDropdown: DropdownComponent | null = null;
		teamSetting.addDropdown((dd) => {
			teamDropdown = dd;
			dd.addOption("", "— select after loading —");
			dd.setValue(this.plugin.settings.defaultTeamId);
			dd.onChange(async (value) => {
				this.plugin.settings.defaultTeamId = value;
				this.plugin.settings.defaultTeamKey =
					(dd.selectEl.selectedOptions[0]?.dataset?.teamKey as string) || "";
				await this.plugin.saveSettings();
			});
		});
		teamSetting.addButton((btn) =>
			btn.setButtonText("Load teams").onClick(async () => {
				if (!this.plugin.settings.apiKey) {
					new Notice("Linear Vault Sync: enter an API key first");
					return;
				}
				try {
					const client = new LinearClient(this.plugin.settings.apiKey);
					const teams = await client.listTeams();
					if (!teamDropdown) return;
					const dd = teamDropdown;
					dd.selectEl.empty();
					dd.addOption("", "— select a team —");
					for (const team of teams) {
						const opt = dd.selectEl.createEl("option", {
							value: team.id,
							text: `${team.name} (${team.key})`,
						});
						opt.dataset.teamKey = team.key;
					}
					dd.setValue(this.plugin.settings.defaultTeamId);
					new Notice(`Linear Vault Sync: loaded ${teams.length} teams`);
				} catch (err) {
					const msg =
						err instanceof LinearApiError ? err.message : String(err);
					new Notice(`Linear Vault Sync: ${msg}`);
				}
			}),
		);

		containerEl.createEl("h3", {
			text: "Sync behavior",
			cls: "lvs-settings-section",
		});

		new Setting(containerEl)
			.setName("Automatic background sync")
			.setDesc("Periodically pull updates from Linear and push local changes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();
						this.plugin.restartAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("Sync interval (minutes)")
			.setDesc("How often to run the background sync.")
			.addDropdown((dd) =>
				dd
					.addOption("5", "Every 5 minutes")
					.addOption("15", "Every 15 minutes")
					.addOption("30", "Every 30 minutes")
					.addOption("60", "Every hour")
					.setValue(String(this.plugin.settings.syncIntervalMinutes))
					.onChange(async (value) => {
						this.plugin.settings.syncIntervalMinutes = Number(value);
						await this.plugin.saveSettings();
						this.plugin.restartAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("Sync on save")
			.setDesc(
				"Push a single note immediately when you modify it. Useful for tight loops.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnSave)
					.onChange(async (value) => {
						this.plugin.settings.syncOnSave = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", {
			text: "Privacy contract",
			cls: "lvs-settings-section",
		});

		const privacyDesc = containerEl.createEl("p", {
			cls: "lvs-settings-hint",
		});
		privacyDesc.createSpan({
			text: "This plugin never reads, sends, or modifies a note unless its frontmatter contains exactly:",
		});
		const codeBlock = containerEl.createEl("pre");
		codeBlock.createEl("code", { text: "---\nlinear-sync: enabled\n---" });
		containerEl.createEl("p", {
			text: "Notes without that key are invisible to the plugin. There is no opt-out flag because the default is opt-out.",
			cls: "lvs-settings-hint",
		});

		containerEl.createEl("h3", {
			text: "Diagnostics",
			cls: "lvs-settings-section",
		});

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Log sync events to the developer console (Ctrl/Cmd+Shift+I).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugLogging)
					.onChange(async (value) => {
						this.plugin.settings.debugLogging = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("p", {
			cls: "lvs-settings-hint",
			text: "Issues, feature requests: github.com/DeFiTON/obsidian-linear-vault-sync",
		});
	}
}
