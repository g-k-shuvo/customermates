#!/usr/bin/env sh
# Runs tests/conventions against a commit (or an exported tree) the way CI's Linux job sees it:
# the tree is streamed into a Linux container, prisma/openapi/raw-docs are regenerated there, the
# committed files are compared with what the generators produce (CI's "Verify generated files are
# committed" step), and then the convention suite runs. Nothing is written into the working tree.
#
# usage: sh scripts/conventions-in-docker.sh <commit-ish | directory>
#   A directory must be a clean tree export (for example an extracted git archive): every file in it
#   is treated as committed.
# env:   CONVENTIONS_IMAGE (default node:24-bookworm-slim)
#        CONVENTIONS_NODE_MODULES_VOLUME (default crm-linux-nm; Linux node_modules, reused between runs)
#
# --testTimeout=120000 differs from CI, which runs vitest's 5s default (vitest.config.ts sets none).
# Measured on this suite in this container: at 5s, 14 tests time out, two of them rule tests whose
# violations would then be reported only as a timeout. Raise testTimeout in vitest.config.ts and this
# flag can go.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: sh scripts/conventions-in-docker.sh <commit-ish | directory>" >&2
  exit 2
fi
target=$1
image=${CONVENTIONS_IMAGE:-node:24-bookworm-slim}
volume=${CONVENTIONS_NODE_MODULES_VOLUME:-crm-linux-nm}

if ! command -v docker >/dev/null 2>&1; then
  echo "conventions: docker is not installed or not on PATH. Install Docker Desktop, or bypass the pre-push check once with SKIP_CONVENTIONS=1 git push" >&2
  exit 3
fi
if ! docker info >/dev/null 2>&1; then
  echo "conventions: Docker is not running (docker info failed). Start Docker Desktop and push again, or bypass the pre-push check once with SKIP_CONVENTIONS=1 git push" >&2
  exit 3
fi

if [ -d "$target" ]; then
  if [ ! -f "$target/yarn.lock" ]; then
    echo "conventions: $target has no yarn.lock" >&2
    exit 2
  fi
  label=$target
  lock=$(git hash-object --no-filters "$target/yarn.lock")
  stream() { tar -C "$target" --exclude=./node_modules --exclude=./.git --exclude=./.next --exclude=./generated -cf - .; }
else
  if ! commit=$(git rev-parse --verify --quiet "$target^{commit}"); then
    echo "conventions: $target is neither a directory nor a commit" >&2
    exit 2
  fi
  label=$(git rev-parse --short "$commit")
  lock=$(git rev-parse "$commit:yarn.lock")
  # autocrlf/eol are pinned because git archive applies them: Git for Windows defaults to
  # autocrlf=true, which would hand the container CRLF files that CI's checkout never has.
  stream() { git -c core.autocrlf=false -c core.eol=lf archive --format=tar "$commit"; }
fi

# shellcheck disable=SC2016
container_script='
quietly() {
  if ! output=$("$@" 2>&1); then
    printf "conventions: %s failed:\n%s\n" "$*" "$output" >&2
    exit 1
  fi
}
started=$(date +%s)
tar -xf - --exclude=node_modules
if [ "$(cat node_modules/.pre-push-yarn-lock 2>/dev/null || true)" != "$LOCK" ]; then
  echo "conventions: yarn.lock changed, installing Linux node_modules into the volume (slow once)" >&2
  quietly yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000
  printf %s "$LOCK" > node_modules/.pre-push-yarn-lock
fi
find . -path ./node_modules -prune -o -type f -exec md5sum {} + > /tmp/committed.md5
quietly npx --no-install prisma generate
quietly yarn -s openapi:generate
quietly yarn -s raw-docs:generate
status=0
if ! md5sum -c --quiet /tmp/committed.md5 > /tmp/stale 2>/dev/null; then
  echo "conventions: committed files differ from what the generators produce (CI step: Verify generated files are committed):" >&2
  sed -e "s/: FAILED.*//" -e "s/^\.\//  /" /tmp/stale >&2
  echo "conventions: run yarn openapi:generate and yarn raw-docs:generate, then commit the result" >&2
  status=1
fi
echo "conventions: tree prepared in $(( $(date +%s) - started ))s, running tests/conventions" >&2
yarn -s conventions:check --reporter=dot --testTimeout=120000 || status=1
exit "$status"
'

echo "conventions: tests/conventions @ $label in $image (node_modules volume $volume)" >&2
started=$(date +%s)
status=0
stream | MSYS_NO_PATHCONV=1 docker run --rm -i --init \
  -v "$volume:/app/node_modules" \
  -e APP_MODE=self-hosted \
  -e CI=true \
  -e DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci \
  -e LOCK="$lock" \
  -w /app "$image" sh -ec "$container_script" || status=$?
echo "conventions: $label finished in $(( $(date +%s) - started ))s (exit $status)" >&2
exit "$status"
