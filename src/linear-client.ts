import { requestUrl } from "obsidian";
import type {
	LinearIssue,
	LinearTeam,
	LinearViewer,
	LinearWorkflowState,
} from "./types";

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export class LinearApiError extends Error {
	constructor(message: string, public readonly cause?: unknown) {
		super(message);
		this.name = "LinearApiError";
	}
}

export class LinearClient {
	constructor(private readonly apiKey: string) {}

	private async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		if (!this.apiKey) {
			throw new LinearApiError("Linear API key is not configured");
		}
		try {
			const res = await requestUrl({
				url: LINEAR_GRAPHQL_ENDPOINT,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: this.apiKey,
				},
				body: JSON.stringify({ query, variables }),
				throw: false,
			});
			if (res.status < 200 || res.status >= 300) {
				throw new LinearApiError(`Linear API HTTP ${res.status}: ${res.text}`);
			}
			const json = res.json as GraphQLResponse<T>;
			if (json.errors && json.errors.length > 0) {
				throw new LinearApiError(
					json.errors.map((e) => e.message).join("; "),
				);
			}
			if (!json.data) {
				throw new LinearApiError("Linear API returned empty response");
			}
			return json.data;
		} catch (err) {
			if (err instanceof LinearApiError) throw err;
			throw new LinearApiError("Failed to reach Linear API", err);
		}
	}

	async getViewer(): Promise<LinearViewer> {
		const data = await this.request<{ viewer: LinearViewer }>(`
			query { viewer { id name email } }
		`);
		return data.viewer;
	}

	async listTeams(): Promise<LinearTeam[]> {
		const data = await this.request<{ teams: { nodes: LinearTeam[] } }>(`
			query { teams(first: 50) { nodes { id name key } } }
		`);
		return data.teams.nodes;
	}

	async listWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
		const data = await this.request<{
			workflowStates: { nodes: LinearWorkflowState[] };
		}>(
			`query($teamId: ID!) {
				workflowStates(filter: { team: { id: { eq: $teamId } } }, first: 50) {
					nodes { id name type }
				}
			}`,
			{ teamId },
		);
		return data.workflowStates.nodes;
	}

	async getIssue(identifier: string): Promise<LinearIssue | null> {
		const data = await this.request<{ issue: LinearIssue | null }>(
			`query($id: String!) {
				issue(id: $id) {
					id identifier title description url updatedAt
					state { id name type }
				}
			}`,
			{ id: identifier },
		);
		return data.issue;
	}

	async createIssue(input: {
		teamId: string;
		title: string;
		description?: string;
	}): Promise<LinearIssue> {
		const data = await this.request<{
			issueCreate: { success: boolean; issue: LinearIssue };
		}>(
			`mutation($input: IssueCreateInput!) {
				issueCreate(input: $input) {
					success
					issue {
						id identifier title description url updatedAt
						state { id name type }
					}
				}
			}`,
			{ input },
		);
		if (!data.issueCreate.success) {
			throw new LinearApiError("Linear issueCreate returned success=false");
		}
		return data.issueCreate.issue;
	}

	async updateIssue(
		issueId: string,
		input: { title?: string; description?: string; stateId?: string },
	): Promise<LinearIssue> {
		const data = await this.request<{
			issueUpdate: { success: boolean; issue: LinearIssue };
		}>(
			`mutation($id: String!, $input: IssueUpdateInput!) {
				issueUpdate(id: $id, input: $input) {
					success
					issue {
						id identifier title description url updatedAt
						state { id name type }
					}
				}
			}`,
			{ id: issueId, input },
		);
		if (!data.issueUpdate.success) {
			throw new LinearApiError("Linear issueUpdate returned success=false");
		}
		return data.issueUpdate.issue;
	}

	async listIssuesUpdatedSince(
		teamId: string,
		sinceIso: string,
	): Promise<LinearIssue[]> {
		const data = await this.request<{
			issues: { nodes: LinearIssue[] };
		}>(
			`query($teamId: ID!, $since: DateTimeOrDuration!) {
				issues(
					filter: {
						team: { id: { eq: $teamId } },
						updatedAt: { gte: $since }
					},
					first: 100,
					orderBy: updatedAt
				) {
					nodes {
						id identifier title description url updatedAt
						state { id name type }
					}
				}
			}`,
			{ teamId, since: sinceIso },
		);
		return data.issues.nodes;
	}
}
