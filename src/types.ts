export interface PluginSettings {
	apiKey: string;
	defaultTeamId: string;
	defaultTeamKey: string;
	syncIntervalMinutes: number;
	autoSync: boolean;
	syncOnSave: boolean;
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: "",
	defaultTeamId: "",
	defaultTeamKey: "",
	syncIntervalMinutes: 15,
	autoSync: true,
	syncOnSave: false,
	debugLogging: false,
};

export interface LinearTeam {
	id: string;
	name: string;
	key: string;
}

export interface LinearWorkflowState {
	id: string;
	name: string;
	type: string;
}

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	state: { id: string; name: string; type: string };
	updatedAt: string;
	url: string;
}

export interface LinearViewer {
	id: string;
	name: string;
	email: string;
}

export interface FrontmatterContract {
	"linear-sync"?: string;
	"linear-id"?: string;
	"linear-team"?: string;
	"linear-status"?: string;
	"linear-title"?: string;
	"linear-url"?: string;
	"linear-updated"?: string;
}

export const SYNC_ENABLED_VALUE = "enabled";
export const FM_KEYS = {
	sync: "linear-sync",
	id: "linear-id",
	team: "linear-team",
	status: "linear-status",
	title: "linear-title",
	url: "linear-url",
	updated: "linear-updated",
} as const;
