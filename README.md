# Linear Vault Sync

> **Two-way sync between your Obsidian vault and Linear.** Privacy-first opt-in per note. Mobile-ready. Zero plugin dependencies.

[![GitHub release](https://img.shields.io/github/v/release/DeFiTON/obsidian-linear-vault-sync?include_prereleases&style=flat-square)](https://github.com/DeFiTON/obsidian-linear-vault-sync/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?label=downloads&query=%24%5B%22linear-vault-sync%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=flat-square)](https://obsidian.md/plugins?id=linear-vault-sync)
[![Issues](https://img.shields.io/github/issues/DeFiTON/obsidian-linear-vault-sync?style=flat-square)](https://github.com/DeFiTON/obsidian-linear-vault-sync/issues)

Manage every project from a single source of truth. Write specs and tasks in Obsidian, mark them with one line of frontmatter, and they appear in Linear — with full two-way state sync. Notes you don't mark are never read, never sent, never touched.

Built for founders, operators, and AI-augmented workflows that span many projects, repos, and servers from one vault.

---

## Why this plugin

Most Linear ↔ Obsidian tools sync **everything** by default, require auxiliary plugins, or run only on desktop. This one is built around three constraints:

| Problem with the alternatives | What this plugin does |
| --- | --- |
| Sync everything by default → private notes leak to the cloud | **Opt-in per note** via `linear-sync: enabled`. No flag = invisible. |
| Need Templater, Local REST API, or other plugins to function | **Zero plugin dependencies.** Pure Linear GraphQL + Obsidian API. |
| Desktop only — useless from your phone in the airport | **Works on iOS and Android** out of the box. |
| Auto-generates hundreds of files from your whole workspace | **Your vault stays yours.** The plugin only mirrors notes you mark. |
| Configuration buried in JSON files | **Settings UI** with team picker, sync interval, test-connection button. |

---

## Features

- **Two-way sync** — Obsidian → Linear (create + update) and Linear → Obsidian (pull status, title, URL into frontmatter).
- **Frontmatter-driven** — every per-note setting lives in YAML you can read, version, and edit by hand.
- **Privacy contract** — single source of truth: `linear-sync: enabled`. Missing or any other value = the file is invisible to the plugin.
- **Multi-team aware** — set a default team in settings; override per-note via `linear-team: <id>`.
- **Background sync** — configurable interval (5/15/30/60 min) or trigger manually via Command Palette.
- **Sync-on-save** — optional tight feedback loop while drafting tasks.
- **Mobile-ready** — `isDesktopOnly: false`, works in Obsidian Mobile.
- **No telemetry, no analytics, no third-party endpoints** — only `api.linear.app`, only when you opt in.

---

## Install

### From Obsidian Community Plugins *(after listing is approved)*

1. Open **Settings → Community plugins → Browse**.
2. Search for **Linear Vault Sync**.
3. Click **Install**, then **Enable**.

### Manually (right now, before the community listing lands)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/DeFiTON/obsidian-linear-vault-sync/releases/latest).
2. Copy them into `<your-vault>/.obsidian/plugins/linear-vault-sync/`.
3. Reload Obsidian. **Settings → Community plugins** → enable **Linear Vault Sync**.

### Via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (for early adopters)

1. Install the **BRAT** plugin.
2. **BRAT → Add Beta Plugin** → paste `DeFiTON/obsidian-linear-vault-sync`.
3. Enable the plugin in Community Plugins.

---

## Quick start (5 minutes)

1. **Get a Linear API key.** linear.app → Settings → API → Personal API keys → **Create key**.
2. **Open Settings → Linear Vault Sync.** Paste the API key. Click **Test connection** — you should see a "connected as ..." toast.
3. **Click "Load teams"**, pick your default team from the dropdown.
4. **Open any note**, add this frontmatter:

```yaml
---
linear-sync: enabled
---
# Add Privacy Filter to the new dashboard

Replace the global toggle with a per-folder setting.
- Acceptance: per-folder override survives plugin reload
- Estimate: 2h
```

5. Run **Command Palette → Linear Vault Sync: Sync now**. Within a few seconds the frontmatter is augmented with `linear-id`, `linear-status`, `linear-url`, `linear-updated` — and the issue appears in Linear.
6. Move the issue to "In Progress" in Linear. Wait for the next background sync (or run Sync now). The `linear-status` field in your note updates.

That's the whole flow.

---

## Frontmatter contract

Every field is optional **except** `linear-sync`. The plugin only ever touches notes where `linear-sync: enabled`.

| Field | Direction | Description |
| --- | --- | --- |
| `linear-sync` | input | **Required**. Set to `enabled` to opt this note in. Any other value (or absent) = invisible. |
| `linear-team` | input | Linear team **ID** override. Defaults to the team set in plugin settings. |
| `linear-id` | output | Linear's internal UUID for the issue. Written on first sync — do not edit. |
| `linear-status` | output | Workflow state name (e.g. "In Progress"). Updated on pull. |
| `linear-title` | output | Issue title pulled from Linear. Useful when Linear is the canonical title. |
| `linear-url` | output | Direct link to the issue on linear.app. |
| `linear-updated` | output | ISO timestamp of the last successful sync. Used for conflict resolution. |

**Title derivation when creating an issue** (in order):
1. `linear-title` frontmatter field, if present
2. First `# Heading` in the body
3. File basename

**Description body** = the note's content **excluding** the frontmatter block.

---

## Privacy contract

The default is **opt-out**. There is no global "sync everything" flag. There never will be.

- A note without `linear-sync: enabled` is **never read**, **never sent**, **never modified**.
- The plugin makes network calls only to `api.linear.app`, only with your API key, only for notes you have marked.
- No telemetry. No analytics. No third-party endpoints. The source is auditable — every API call is in [`src/linear-client.ts`](src/linear-client.ts).

---

## Commands

Available via Command Palette (Ctrl/Cmd + P):

- **Linear Vault Sync: Sync now** — runs a full push + pull cycle.
- **Linear Vault Sync: Enable sync on current note** — adds `linear-sync: enabled` to the active note's frontmatter.
- **Linear Vault Sync: Disable sync on current note** — removes the flag.

---

## Roadmap

- **v0.2** — webhook support (real-time Linear → Obsidian), comments mirroring, per-folder default team
- **v0.3** — Linear sub-issues mapped to backlinks / outline, attachments
- **v0.4** — Dataview-style query block (`linear-query: ...`) for live dashboards inside notes
- **v0.5** — multi-workspace support, encrypted API key storage

Track these on the [Issues page](https://github.com/DeFiTON/obsidian-linear-vault-sync/issues). PRs welcome.

---

## Contributing

```bash
git clone https://github.com/DeFiTON/obsidian-linear-vault-sync.git
cd obsidian-linear-vault-sync
npm install
npm run dev   # rebuild on every change
```

Point your test vault at the cloned folder via a symlink:

```bash
ln -s "$(pwd)" "<your-vault>/.obsidian/plugins/linear-vault-sync"
```

Reload Obsidian (Ctrl/Cmd + R). Edits compile automatically.

---

## License

[MIT](LICENSE). Do whatever you want.

---

## Author

Built by **Sviatoslav Gusev** — founder, operator, technical strategist. I manage 12+ projects across multiple servers from a single Obsidian vault. This plugin scratches my own itch.

- Website — [gusev.biz](https://gusev.biz)
- Telegram — [@gusevself](https://t.me/gusevself)
- X / Twitter — [@gusevlife](https://twitter.com/gusevlife)
- LinkedIn — [linkedin.com/in/gusevlife](https://www.linkedin.com/in/gusevlife/)
- GitHub — [@DeFiTON](https://github.com/DeFiTON)

If this plugin saves you time, drop me a line on [Telegram](https://t.me/gusevself) or star the repo. That's the real currency.
