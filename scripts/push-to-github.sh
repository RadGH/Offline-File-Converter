#!/usr/bin/env bash
#
# Pushes the converter/ subtree of /home/radgh/claude (parent monorepo)
# to the standalone https://github.com/RadGH/Offline-File-Converter repo.
#
# Uses git subtree split — non-destructive to the parent repo.
#
# Requires: parent repo has a clean working tree, access token at
# /home/radgh/claude/assets/references/github-access-token.txt.

set -euo pipefail

PARENT_ROOT="/home/radgh/claude"
SUBTREE_PREFIX="converter"
BRANCH_NAME="converter-export"
TOKEN_FILE="${PARENT_ROOT}/assets/references/github-access-token.txt"
REMOTE_REPO="github.com/RadGH/Offline-File-Converter.git"

cd "${PARENT_ROOT}"

if [ ! -f "${TOKEN_FILE}" ]; then
  echo "Token file not found: ${TOKEN_FILE}" >&2
  exit 1
fi

TOKEN=$(tr -d '[:space:]' < "${TOKEN_FILE}")

git branch -D "${BRANCH_NAME}" 2>/dev/null || true
git subtree split --prefix="${SUBTREE_PREFIX}" -b "${BRANCH_NAME}"

git push "https://${TOKEN}@${REMOTE_REPO}" "${BRANCH_NAME}:main" \
  2>&1 | sed "s|${TOKEN}|***|g"

git branch -D "${BRANCH_NAME}"

echo "Done — pushed ${SUBTREE_PREFIX}/ to https://${REMOTE_REPO} main"
