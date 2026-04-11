# Release & Deployment Guide

VidGrid-HTML is deployed as a static site on **GitLab Pages** via a CI/CD
pipeline defined in `.gitlab-ci.yml`. No backend is required — the build
output is a single directory of static files served directly by GitLab.

---

## First-time setup on GitLab (free tier)

### 1 · Create or import the repository

Push this project to a GitLab repository under your namespace or a group.

```bash
git remote add origin https://gitlab.com/<namespace>/VidGrid-HTML.git
git push -u origin main
```

### 2 · Enable GitLab Pages (if not already enabled)

GitLab Pages is available on all tiers, including free. No extra configuration
is needed — the pipeline handles everything automatically once the CI file is
present.

### 3 · Verify the `base` URL in `vite.config.ts`

The Vite `base` option must match your repository path exactly, including
capitalisation. For a project at `gitlab.com/myuser/VidGrid-HTML`:

```ts
// vite.config.ts
base: "/VidGrid-HTML/",
```

For a project nested under a group (`gitlab.com/mygroup/tools/VidGrid-HTML`):

```ts
base: "/tools/VidGrid-HTML/",
```

### 4 · Trigger the first deployment

Push any commit to the default branch (usually `main`). GitLab will
automatically run the pipeline:

1. **build** job — installs dependencies and runs `npm run build`.
2. **pages** job — renames `dist/` to `public/` and uploads it as a Pages
   artifact.

Monitor progress in **CI/CD → Pipelines** in the GitLab sidebar.

### 5 · Find your live URL

Once the `pages` job completes, the site is available at:

```text
https://<namespace>.gitlab.io/<project-path>/
```

You can also find the exact URL under **Deploy → Pages** in your project
settings.

> **Note for group namespaces:** the URL structure is
> `https://<group>.gitlab.io/<subgroup>/<project>/` for nested paths.

---

## Ongoing releases

Every merge or push to the default branch re-runs the pipeline and
automatically publishes the new version. No manual steps are needed.

### Publishing a named release

1. Bump the version in `package.json`.
2. Commit and tag:

   ```bash
   git tag v1.2.0
   git push origin main --tags
   ```

3. Optionally create a formal GitLab Release:
   - Go to **Deploy → Releases → New release**.
   - Select the tag, add release notes, and publish.

---

## Local build verification

Before pushing, verify the production build locally:

```bash
npm ci
npm run build      # output in dist/
npm run preview    # serves dist/ at http://localhost:4173/VidGrid-HTML/
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| 404 on the Pages URL | `base` mismatch in `vite.config.ts` | Match `base` to your exact repo path |
| WASM files not loading | Browser blocked cross-origin request | Ensure HTTPS; Pages always uses HTTPS |
| Pipeline fails at `npm ci` | `package-lock.json` not committed | Commit the lockfile |
| `pages` job skipped | Push was not to the default branch | Merge / push to `main` (or rename in `.gitlab-ci.yml`) |
