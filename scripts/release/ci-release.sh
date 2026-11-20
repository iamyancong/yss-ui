#!/bin/sh
set -e

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
corepack prepare pnpm@8.10.0 --activate || true
pnpm install --frozen-lockfile

# Ensure git is available and deepen history to find last release commit
if ! command -v git >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache git openssh ca-certificates
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*
  fi
fi
git config --global --add safe.directory /app
git fetch origin "${CI_COMMIT_REF_NAME:-dev}" --deepen=500 || true

# npm auth
mkdir -p ~/.npm
NPM_HOST_TARGET="${NPM_REGISTRY_AUTH_HOST:-registry.npmjs.org}"
echo "//${NPM_HOST_TARGET}/:_authToken=${NPM_TOKEN}" >> ~/.npmrc

# Compute diff base
# 匹配所有 release 格式: "chore(release): bump packages" 或 "chore(release): patch N package(s)"
LAST_BUMP="$(git log origin/dev --grep "^chore(release):" -n 1 --pretty=format:%H || true)"
if [ -z "$LAST_BUMP" ]; then
  LAST_BUMP="$(git rev-list --max-parents=0 HEAD)"
fi
BASE="$LAST_BUMP"
echo "Resolved base for diff: $BASE"

# Release changed packages
node scripts/release/release-changed.js ${BUMP:-patch} --base="$BASE"

# Commit and push version bumps
# Resolve git identity with fallbacks to GitLab predefined vars, then safe defaults
RESOLVED_USERNAME="${USERNAME:-${GITLAB_USER_NAME:-yss-ci}}"
RESOLVED_USEREMAIL="${USEREMAIL:-${GITLAB_USER_EMAIL:-yss-ci@yss-tech.com}}"
git config --global user.name "$RESOLVED_USERNAME"
git config --global user.email "$RESOLVED_USEREMAIL"
git add packages/*/package.json packages/mcp/index.hash docs/changelog/mcp.md .dumi/theme/slots/Features/generated-releases.json || true

if git diff --cached --quiet; then
  echo "no version changes to commit"
  exit 0
fi
SUMMARY_FILE="scripts/.release-summary.json"
COMMIT_SUBJ=$(node -e '
  const fs = require("fs");
  const p = process.env.SUMMARY_FILE || "scripts/.release-summary.json";
  let list = [];
  try {
    const obj = JSON.parse(fs.readFileSync(p, "utf8"));
    list = Array.isArray(obj.packages) ? obj.packages : [];
  } catch (_) {}
  const bump = process.env.BUMP || "patch";
  if (list.length > 0) {
    console.log(`chore(release): ${bump} ${list.length} package(s) [skip ci]`);
  } else {
    console.log("chore(release): bump packages [skip ci]");
  }
')
COMMIT_BODY=$(node -e '
  const fs = require("fs");
  const p = process.env.SUMMARY_FILE || "scripts/.release-summary.json";
  let list = [];
  try {
    const obj = JSON.parse(fs.readFileSync(p, "utf8"));
    list = Array.isArray(obj.packages) ? obj.packages : [];
  } catch (_) {}
  if (list.length > 0) {
    const lines = list.map(x => `- ${x.name}: ${x.oldVersion} -> ${x.newVersion}`);
    console.log(lines.join("\n"));
  } else {
    console.log("");
  }
')
if [ -n "$COMMIT_BODY" ]; then
  git commit -m "$COMMIT_SUBJ" -m "$COMMIT_BODY"
else
  git commit -m "$COMMIT_SUBJ"
fi

# Normalize repository URL and inject credentials if necessary
SANITIZED_REPO_URL="$(echo "$CI_REPOSITORY_URL" | sed -E "s#^(https?://)([^@]+@)?#\\1#")"
if [ -n "$GITLAB_ACCESS_TOKEN" ]; then
  PUSH_URL="$(echo "$SANITIZED_REPO_URL" | sed -E "s#^(https?://)#\\1oauth2:${GITLAB_ACCESS_TOKEN}@#")"
elif [ -n "$GIT_LAB_PUSH_TOKEN" ]; then
  PUSH_URL="$(echo "$SANITIZED_REPO_URL" | sed -E "s#^(https?://)#\\1oauth2:${GIT_LAB_PUSH_TOKEN}@#")"
elif [ -n "$CI_JOB_TOKEN" ]; then
  PUSH_URL="$(echo "$SANITIZED_REPO_URL" | sed -E "s#^(https?://)#\\1gitlab-ci-token:${CI_JOB_TOKEN}@#")"
elif echo "$CI_REPOSITORY_URL" | grep -q "@"; then
  PUSH_URL="$CI_REPOSITORY_URL"
else
  echo "Error: No valid Git credentials found (GITLAB_ACCESS_TOKEN/GIT_LAB_PUSH_TOKEN/CI_JOB_TOKEN)" >&2
  exit 1
fi

# Fetch and rebase before push to handle concurrent commits
echo "Fetching latest changes from remote..."
git fetch "$PUSH_URL" "${CI_COMMIT_REF_NAME:-dev}" || true
git rebase "FETCH_HEAD" || {
  echo "Rebase failed, attempting merge strategy..."
  git rebase --abort || true
  git pull "$PUSH_URL" "${CI_COMMIT_REF_NAME:-dev}" --no-edit || true
}

git push "$PUSH_URL" "HEAD:${CI_COMMIT_REF_NAME:-dev}"

