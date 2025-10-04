#!/usr/bin/env bash

echo "=== 1. Current directory & Git root ==="
PWD=$(pwd)
echo "PWD: $PWD"

# Does it seem like a git repo?
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_ROOT=$(git rev-parse --show-toplevel)
  echo "Git root: $GIT_ROOT"
else
  echo "Not inside a git work tree."
  GIT_ROOT=""
fi

echo
echo "=== 2. List files here ==="
ls -la

echo
echo "=== 3. Git status ==="
git status

echo
echo "=== 4. Check for ignored files (sample) ==="
# For a few sample filenames in current folder (if any)
for f in * .*; do
  # skip . and .. and .git
  if [ "$f" = "." ] || [ "$f" = ".." ] || [ "$f" = ".git" ]; then
    continue
  fi
  # only test a few
  if [ -f "$f" ]; then
    IG=$(git check-ignore -v "$PWD/$f")
    if [ -n "$IG" ]; then
      echo "Ignored: $f  →  $IG"
    fi
  fi
done

echo
echo "=== 5. Compare actual files vs git tree entries ==="
# List all filesystem files (non - hidden) and all files known to git
echo "Filesystem (non-hidden) in current dir:"
ls

echo
echo "Git tracked files:"
git ls-files

echo
echo "=== 6. Show .gitignore content (if exists) ==="
if [ -f .gitignore ]; then
  echo "Contents of .gitignore:"
  cat .gitignore
else
  echo "No .gitignore file."
fi

echo
echo "=== 7. Show nested .git dirs (if any) ==="
find . -type d -name ".git" -print

echo
echo "=== 8. Show remote origin URL (if repo) ==="
git remote -v

echo
echo "=== DONE ==="