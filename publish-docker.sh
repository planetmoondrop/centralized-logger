#!/bin/bash
set -e

BRANCH="docker-release"
REMOTE="docker-public"

git subtree split --prefix=docker -b $BRANCH
git push $REMOTE $BRANCH --force

echo "✅ Docker folder published"