#!/bin/sh
# Raises the version in package.json (patch, minor, major or x.y.z), commits it, tags vX.Y.Z and
# pushes both, the same as the Bump version workflow. npm version does not commit in a subfolder
# of the repository, so the commit and the tag are made here.
set -e
cd "$(dirname "$0")/.."
version=$(npm version "${1:-patch}" --no-git-tag-version)
git add package.json package-lock.json
git commit -m "$version"
git tag -a "$version" -m "$version"
git push --follow-tags
