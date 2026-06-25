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
is needed — the pipeline handles everything automatically once the CI file is present.

### 3 · Verify the `base` URL in `vite.config.ts`

GitLab Pages now serves projects on **unique subdomains by default**, so your
Vite `base` setting depends on which URL format your project uses.

#### Default (recommended - unique domain)

Most new projects use a unique domain like:

```url
https://<project-name>-<namespace>.gitlab.io/
```

In this case, use:

```ts
// vite.config.ts
base: "/",
```

---

#### Legacy / group path-based URLs

If your project is explicitly configured to use the older shared domain format:

```url
https://<namespace>.gitlab.io/<project-path>/
```

Then you must match the repository path exactly:

```ts
base: "/VidGrid-HTML/",
```

For nested groups:

```ts
base: "/tools/VidGrid-HTML/",
```

---

### 4 · Trigger the first deployment

Push any commit to the default branch (usually `main`). GitLab will
automatically run the pipeline:

1. **build** job — installs dependencies and runs `npm run build`.
2. **pages** job — renames `dist/` to `public/` and uploads it as a Pages
   artifact.

Monitor progress in **CI/CD → Pipelines** in the GitLab sidebar.

### 5 · Find your live URL

Once the `pages` job completes, the site is available at:

#### Default (unique domain)

```url
https://<project-name>-<namespace>.gitlab.io/
```

#### Legacy (path-based)

```url
https://<namespace>.gitlab.io/<project-path>/
```

> You can always find the exact URL under **Deploy → Pages** in your project settings.

---

## Ongoing releases

Every merge or push to the default branch (**master**) re-runs the pipeline and
automatically publishes the new version. No manual steps are needed.

### Publishing a named release

Your workflow uses a **development** branch for active work and **master** for releases.
The CI/CD pipeline deploys to GitLab Pages on every push to **master**.

1. **Merge development into master (locally, don't push yet)**

   ```bash
   git checkout master
   git merge development --no-edit
   ```

2. **Bump the version and create a tag**

   Choose the appropriate semver bump based on the changes since the last release:

   ```bash
   # Major breaking change
   npm version major -m "chore(release): v%s"

   # New features, backward compatible
   npm version minor -m "chore(release): v%s"

   # Bug fixes, backward compatible
   npm version patch -m "chore(release): v%s"
   ```

   `npm version` automatically updates `package.json` and creates an annotated git tag (e.g. `v3.2.1`).

3. **Push the commit and tag to remote**

   This single push triggers the CI pipeline and deploys the new version to GitLab Pages:

   ```bash
   git push origin master --tags
   ```

4. **(Optional) Sync the version back to development**

   This keeps both branches in sync so `development` doesn't show an outdated version:

   ```bash
   git checkout development
   git merge master
   git push origin development
   ```

5. **(Optional) Create a formal GitLab Release**
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

> If using a legacy `base`, preview may include the subpath (e.g. `/VidGrid-HTML/`).

---

## Troubleshooting

| Symptom                    | Likely cause                        | Fix                                                           |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| 404 on the Pages URL       | `base` mismatch in `vite.config.ts` | Use `/` for unique domains or match repo path for legacy URLs |
| Assets not loading         | Incorrect base path                 | Double-check `base` setting                                   |
| WASM files not loading     | Browser blocked request             | Ensure HTTPS (Pages always uses HTTPS)                        |
| Pipeline fails at `npm ci` | `package-lock.json` not committed   | Commit the lockfile                                           |
| `pages` job skipped        | Push was not to the default branch  | Merge / push to `master` (or update `.gitlab-ci.yml`)         |
