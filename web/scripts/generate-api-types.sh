#!/usr/bin/env bash
# Generate lib/generated/api.d.ts from the backend's committed OpenAPI snapshot.
# The backend owns the contract: regenerate it with `uv run python scripts/export_openapi.py`.
#   bash scripts/generate-api-types.sh          write the types
#   bash scripts/generate-api-types.sh --check  fail if the committed types are stale
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

schema_path="../backend/docs/openapi.json"
types_path="lib/generated/api.d.ts"
mode="${1:-generate}"
case "$mode" in
  generate | --check) ;;
  *) printf '%s\n' 'Usage: bash scripts/generate-api-types.sh [--check]' >&2; exit 2 ;;
esac
for executable in node_modules/.bin/openapi-typescript node_modules/.bin/prettier; do
  if [[ ! -x "$executable" ]]; then
    printf '%s\n' 'Dependencies are missing. Run npm ci in web first.' >&2
    exit 1
  fi
done

stage_dir="$(mktemp -d "$project_dir/.openapi-work.XXXXXX")"
trap 'rm -rf -- "$stage_dir"' EXIT

node scripts/validate-openapi.mjs "$schema_path"
node_modules/.bin/openapi-typescript "$schema_path" --output "$stage_dir/api.d.ts"
node_modules/.bin/prettier --parser typescript --stdin-filepath "$types_path" \
  < "$stage_dir/api.d.ts" > "$stage_dir/formatted-api.d.ts"

if [[ "$mode" == "--check" ]]; then
  if ! cmp -s -- "$types_path" "$stage_dir/formatted-api.d.ts"; then
    printf '%s\n' 'Generated API types are stale. Run npm run api:generate and commit the result.' >&2
    exit 1
  fi
  printf '%s\n' 'Generated API types match the backend OpenAPI snapshot.'
else
  mkdir -p lib/generated
  mv -- "$stage_dir/formatted-api.d.ts" "$types_path"
  printf '%s\n' "Updated $types_path from $schema_path."
fi
