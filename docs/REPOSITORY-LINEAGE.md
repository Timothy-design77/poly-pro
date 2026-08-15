# Poly Pro Repository Lineage

This document defines which repository is authoritative and how historical iterations are retained.

## Canonical repository

### `Timothy-design77/poly-pro`

- **Role:** Current production application and sole development target.
- **Status:** Active.
- **Policy:** All new features, fixes, releases, documentation, and deployment work belong here.
- **Naming:** Keep the clean, versionless name `poly-pro`. Product versions belong in Git tags and releases, not in the repository name.

Recommended repository description:

> Current production Poly Pro PWA — advanced metronome, recording, drumming analysis, and timing analytics.

Recommended topics:

- `metronome`
- `pwa`
- `react`
- `typescript`
- `web-audio`
- `drumming`
- `timing-analysis`
- `polyrhythm`

## Historical repositories

### `Timothy-design77/polyrhythm-pro`

- **Historical role:** Original single-file implementation.
- **Current status:** Archived.
- **Target name:** `poly-pro-legacy-v1`.
- **Final description:** Archived Poly Pro v1 single-file PWA. Superseded by `Timothy-design77/poly-pro`.
- **Maintenance policy:** Preserve for history only. Do not accept new product work.

### `Timothy-design77/Metronome-app`

- **Historical role:** Intermediate React/PWA scaffold and Phase 1 metronome-engine prototype.
- **Current status:** Archived.
- **Target name:** `poly-pro-react-prototype`.
- **Final description:** Archived React/PWA prototype covering the initial scaffold and metronome engine. Superseded by `Timothy-design77/poly-pro`.
- **Maintenance policy:** Preserve for history only. Do not accept new product work.

## Final repository structure

```text
poly-pro
└── Current production application

poly-pro-legacy-v1
└── Original single-file implementation

poly-pro-react-prototype
└── Intermediate React/PWA prototype
```

## Rename procedure

The GitHub App used by ChatGPT can modify repository contents but does not expose repository-level rename, archive, description, topic, or Pages controls. Apply these settings directly in GitHub.

For each archived repository:

1. Open the repository's **Settings → General → Danger Zone**.
2. Temporarily unarchive the repository.
3. Rename it to the target name listed above.
4. Update its description.
5. Disable GitHub Pages unless the legacy demo should remain public.
6. Add a clear archive notice to the README linking to `Timothy-design77/poly-pro`.
7. Re-archive the repository.

GitHub redirects normal repository URLs and Git remotes after a rename. GitHub Pages project-site URLs use the repository name and therefore require separate verification.

## Rules for future iterations

- Do not create a new repository for routine redesigns, release versions, or architecture changes.
- Use feature branches and pull requests inside `poly-pro`.
- Use tags such as `v2.0.0` and GitHub Releases for stable versions.
- Create another repository only when the product, security boundary, deployment unit, or technology stack is genuinely independent.
- Archive abandoned experiments promptly and link them back to the canonical repository.
