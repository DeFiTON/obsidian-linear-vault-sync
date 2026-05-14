import { App, Notice, TFile, parseYaml, stringifyYaml } from "obsidian";
import { LinearClient, LinearApiError } from "./linear-client";
import {
	FM_KEYS,
	SYNC_ENABLED_VALUE,
	type PluginSettings,
	type LinearIssue,
} from "./types";

interface ParsedNote {
	frontmatter: Record<string, unknown>;
	bodyWithoutFrontmatter: string;
	rawFrontmatterBlock: string | null;
}

export interface SyncResult {
	pushed: number;
	pulled: number;
	skipped: number;
	errors: number;
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/;

export class SyncEngine {
	private inFlight = false;
	private lastFullSyncIso: string | null = null;

	constructor(
		private readonly app: App,
		private readonly settings: PluginSettings,
		private readonly client: LinearClient,
		private readonly log: (msg: string, ...rest: unknown[]) => void,
	) {}

	async runFullSync(): Promise<SyncResult> {
		if (this.inFlight) {
			this.log("Sync already in flight, skipping");
			return { pushed: 0, pulled: 0, skipped: 0, errors: 0 };
		}
		this.inFlight = true;
		const result: SyncResult = { pushed: 0, pulled: 0, skipped: 0, errors: 0 };
		try {
			await this.pushLocalChanges(result);
			await this.pullRemoteChanges(result);
			this.lastFullSyncIso = new Date().toISOString();
		} finally {
			this.inFlight = false;
		}
		return result;
	}

	async syncSingleFile(file: TFile): Promise<void> {
		if (this.inFlight) return;
		try {
			await this.pushFile(file);
		} catch (err) {
			this.log("syncSingleFile failed", err);
			if (err instanceof LinearApiError) {
				new Notice(`Frontlink: ${err.message}`);
			}
		}
	}

	private async pushLocalChanges(result: SyncResult): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			try {
				const pushed = await this.pushFile(file);
				if (pushed === "pushed") result.pushed += 1;
				else if (pushed === "skipped") result.skipped += 1;
			} catch (err) {
				result.errors += 1;
				this.log(`Push failed for ${file.path}`, err);
			}
		}
	}

	private async pushFile(
		file: TFile,
	): Promise<"pushed" | "skipped" | "noop"> {
		const raw = await this.app.vault.read(file);
		const parsed = parseNote(raw);
		const fm = parsed.frontmatter;
		if (fm[FM_KEYS.sync] !== SYNC_ENABLED_VALUE) {
			return "skipped";
		}
		const teamId = (fm[FM_KEYS.team] as string) || this.settings.defaultTeamId;
		if (!teamId) {
			this.log(`No team configured for ${file.path}, skipping`);
			return "skipped";
		}
		const title = this.deriveTitle(file, parsed);
		const description = parsed.bodyWithoutFrontmatter.trim();
		const existingId = fm[FM_KEYS.id] as string | undefined;
		let issue: LinearIssue;
		if (!existingId) {
			issue = await this.client.createIssue({ teamId, title, description });
			this.log(`Created Linear issue ${issue.identifier} for ${file.path}`);
		} else {
			issue = await this.client.updateIssue(existingId, { title, description });
			this.log(`Updated Linear issue ${issue.identifier} from ${file.path}`);
		}
		await this.writeBackIssueMeta(file, parsed, issue);
		return "pushed";
	}

	private async pullRemoteChanges(result: SyncResult): Promise<void> {
		const teams = this.collectKnownTeams();
		if (teams.size === 0) {
			this.log("No teams to pull from");
			return;
		}
		const since = this.lastFullSyncIso || isoOneDayAgo();
		const filesByIssueId = await this.indexFilesByIssueId();
		for (const teamId of teams) {
			try {
				const issues = await this.client.listIssuesUpdatedSince(teamId, since);
				for (const issue of issues) {
					const file = filesByIssueId.get(issue.id);
					if (!file) continue;
					try {
						await this.updateLocalFromRemote(file, issue);
						result.pulled += 1;
					} catch (err) {
						result.errors += 1;
						this.log(`Pull failed for ${file.path}`, err);
					}
				}
			} catch (err) {
				result.errors += 1;
				this.log(`listIssuesUpdatedSince failed for team ${teamId}`, err);
			}
		}
	}

	private collectKnownTeams(): Set<string> {
		const teams = new Set<string>();
		if (this.settings.defaultTeamId) teams.add(this.settings.defaultTeamId);
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const team = cache?.frontmatter?.[FM_KEYS.team];
			if (typeof team === "string" && team.length > 0) teams.add(team);
		}
		return teams;
	}

	private async indexFilesByIssueId(): Promise<Map<string, TFile>> {
		const map = new Map<string, TFile>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;
			if (fm[FM_KEYS.sync] !== SYNC_ENABLED_VALUE) continue;
			const id = fm[FM_KEYS.id];
			if (typeof id === "string" && id.length > 0) map.set(id, file);
		}
		return map;
	}

	private async updateLocalFromRemote(
		file: TFile,
		issue: LinearIssue,
	): Promise<void> {
		const raw = await this.app.vault.read(file);
		const parsed = parseNote(raw);
		const localUpdated = parsed.frontmatter[FM_KEYS.updated] as
			| string
			| undefined;
		if (localUpdated && localUpdated >= issue.updatedAt) {
			return;
		}
		await this.writeBackIssueMeta(file, parsed, issue);
	}

	private async writeBackIssueMeta(
		file: TFile,
		parsed: ParsedNote,
		issue: LinearIssue,
	): Promise<void> {
		const nextFm: Record<string, unknown> = { ...parsed.frontmatter };
		nextFm[FM_KEYS.id] = issue.id;
		nextFm[FM_KEYS.team] = nextFm[FM_KEYS.team] ?? this.settings.defaultTeamId;
		nextFm[FM_KEYS.status] = issue.state.name;
		nextFm[FM_KEYS.title] = issue.title;
		nextFm[FM_KEYS.url] = issue.url;
		nextFm[FM_KEYS.updated] = issue.updatedAt;
		const nextRaw = serializeNote(nextFm, parsed.bodyWithoutFrontmatter);
		await this.app.vault.modify(file, nextRaw);
	}

	private deriveTitle(file: TFile, parsed: ParsedNote): string {
		const overrideTitle = parsed.frontmatter[FM_KEYS.title];
		if (typeof overrideTitle === "string" && overrideTitle.trim().length > 0) {
			return overrideTitle.trim();
		}
		const firstHeading = parsed.bodyWithoutFrontmatter.match(/^#\s+(.+)$/m);
		if (firstHeading) return firstHeading[1].trim();
		return file.basename;
	}
}

export function parseNote(raw: string): ParsedNote {
	const match = raw.match(FRONTMATTER_REGEX);
	if (!match) {
		return {
			frontmatter: {},
			bodyWithoutFrontmatter: raw,
			rawFrontmatterBlock: null,
		};
	}
	const fmRaw = match[1];
	let fm: Record<string, unknown> = {};
	try {
		const parsed = parseYaml(fmRaw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			fm = parsed as Record<string, unknown>;
		}
	} catch {
		fm = {};
	}
	return {
		frontmatter: fm,
		bodyWithoutFrontmatter: raw.slice(match[0].length),
		rawFrontmatterBlock: fmRaw,
	};
}

function serializeNote(
	frontmatter: Record<string, unknown>,
	body: string,
): string {
	const yaml = stringifyYaml(frontmatter).trim();
	const normalizedBody = body.startsWith("\n") ? body : `\n${body}`;
	return `---\n${yaml}\n---${normalizedBody}`;
}

function isoOneDayAgo(): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString();
}
