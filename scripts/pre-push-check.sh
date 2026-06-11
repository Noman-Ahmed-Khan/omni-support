#!/usr/bin/env bash

set -Eeuo pipefail

# Colors
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
WHITE='\033[0;97m'

# Config
APP_IMAGE="test-app"
WORKER_IMAGE="test-worker"

TOTAL_STEPS=11
START_TIME=$(date +%s)

# Spinner
spinner() {
  local pid=$1
  local msg=$2
  local step=$3

  local i=0
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

  while kill -0 "$pid" 2>/dev/null; do
    printf "\r${CYAN}%s${RESET} %s %s" \
      "${frames[$i]}" \
      "$msg" \
      "$(progress_bar "$step" "$TOTAL_STEPS")"

    i=$(( (i + 1) % 10 ))
    sleep 0.08
  done
}

# Global Progress Bar
progress_bar() {
  local step=$1
  local total=$2

  local width=30
  local filled=$(( step * width / total ))
  local empty=$(( width - filled ))
  local pct=$(( step * 100 / total ))

  local bar=""

  for ((i=0; i<filled; i++)); do
    bar+="▸"
  done

  for ((i=0; i<empty; i++)); do
    bar+="·"
  done

  printf "%s %3d%%" "$bar" "$pct"
}

# Step Runner
run_step() {
  local num=$1
  local label=$2
  shift 2

  echo
  printf "${CYAN}[%d/%d]${RESET} ${BOLD}${WHITE}%s${RESET}\n\n" \
    "$num" "$TOTAL_STEPS" "$label"

  local start
  start=$(date +%s)

  local tmpout
  tmpout=$(mktemp)

  "$@" >"$tmpout" 2>&1 &
  local pid=$!

  spinner "$pid" "$label" "$num"

  wait "$pid"
  local rc=$?

  local elapsed=$(( $(date +%s) - start ))

  if [[ $rc -eq 0 ]]; then
    printf "\r${GREEN}✓${RESET} %s %s ${DIM}(%ss)${RESET}\n" \
        "$label" \
        "$(progress_bar "$num" "$TOTAL_STEPS")" \
        "$elapsed"

    # progress_bar "$num" "$TOTAL_STEPS"

    rm -f "$tmpout"
  else
    printf "\r${RED}✗${RESET} ${BOLD}%s failed${RESET}\n" "$label"

    echo
    printf "${DIM}──────────────── Error Output (last 200 lines) ────────────────${RESET}\n"
    tail -n 200 "$tmpout"
    printf "${DIM}───────────────────────────────────────────────────────────────${RESET}\n"

    rm -f "$tmpout"
    exit 1
  fi
}

# Cleanup
cleanup() {
  echo
  printf "${DIM}Cleaning up Docker images...${RESET}\n"

  docker image rm -f "$APP_IMAGE" >/dev/null 2>&1 || true
  docker image rm -f "$WORKER_IMAGE" >/dev/null 2>&1 || true

  printf "${DIM}Done.${RESET}\n"
}

trap cleanup EXIT

# Header
echo
printf "${BOLD}${WHITE}────────────────────────────────────────────${RESET}\n"
printf "${BOLD}${WHITE}           Pre-Push CI Checks${RESET}\n"
printf "${BOLD}${WHITE}────────────────────────────────────────────${RESET}\n"
printf "${DIM}Local:${RESET} lint • prettier • typecheck • prisma • unit • integration • e2e • build • docker\n"
printf "${DIM}GitHub:${RESET} trivy scan • SARIF upload • code scanning • image push\n"

# Checks
run_step 1 "Installing dependencies" \
  npm ci

run_step 2 "Generating Prisma Client" \
  npm run db:generate

run_step 3 "Running ESLint" \
  npm run lint

run_step 4 "Auto-formatting code" \
  npm run format

run_step 5 "Running TypeScript type check" \
  npm run typecheck

run_step 6 "Running unit tests" \
  npm run test:unit

run_step 7 "Running integration tests" \
  npm run test:integration

run_step 8 "Running E2E tests" \
  npm run test:e2e

run_step 9 "Building application" \
  npm run build

run_step 10 "Building app Docker image" \
  docker build \
    -f docker/app/Dockerfile \
    -t "$APP_IMAGE" \
    .

run_step 11 "Building worker Docker image" \
  docker build \
    -f docker/worker/Dockerfile \
    -t "$WORKER_IMAGE" \
    .

# Footer
TOTAL_TIME=$(( $(date +%s) - START_TIME ))

echo
printf "${BOLD}${WHITE}────────────────────────────────────────────${RESET}\n"
printf "${GREEN}✓ All checks passed${RESET} ${DIM}(%ss total)${RESET}\n" "$TOTAL_TIME"
printf "${BOLD}${WHITE}────────────────────────────────────────────${RESET}\n"
echo