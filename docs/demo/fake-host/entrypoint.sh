#!/usr/bin/env bash
# Deterministic demo host for the Harold video.
#
# Every container start rebuilds the demo user's home from the image fixture:
# two git repositories, a cat-screensaver feature worktree, ~/.harold state,
# and scripted ACP agent history. A restart therefore resets the whole demo.
set -euo pipefail

HOME_DIR=/home/gary
DEMO_HOME=/opt/harold-demo

log() { printf 'demo-host: %s\n' "$*"; }

install -d -m 0755 /run/sshd
install -d -o gary -g gary -m 0755 \
  "$HOME_DIR/sites" \
  "$HOME_DIR/git" \
  "$HOME_DIR/.harold" \
  "$HOME_DIR/.harold-demo" \
  "$HOME_DIR/.harold-demo/agents" \
  "$HOME_DIR/.ssh"

rm -rf \
  "$HOME_DIR/sites" \
  "$HOME_DIR/git" \
  "$HOME_DIR/.harold" \
  "$HOME_DIR/.harold-demo"
install -d -o gary -g gary -m 0755 \
  "$HOME_DIR/sites" \
  "$HOME_DIR/git" \
  "$HOME_DIR/.harold" \
  "$HOME_DIR/.harold-demo" \
  "$HOME_DIR/.harold-demo/agents" \
  "$HOME_DIR/.ssh"

log "seeding repositories"
cp -a "$DEMO_HOME/fixture/cat-screensaver/." "$HOME_DIR/sites/cat-screensaver/"
chown -R gary:gary "$HOME_DIR/sites/cat-screensaver"

write_repo() {
  local path=$1
  shift
  install -d -o gary -g gary -m 0755 "$path"
  for file in "$@"; do
    local name=${file%%:*}
    local body=${file#*:}
    printf '%s\n' "$body" >"$path/$name"
  done
  chown -R gary:gary "$path"
}

write_repo "$HOME_DIR/sites/moonlit-garden" \
  "README.md:# Moonlit Garden" \
  "scene.js:export const palette = [\"#0b1020\", \"#27325a\", \"#b6f36b\"]" \
  "package.json:{\"name\":\"moonlit-garden\",\"private\":true,\"type\":\"module\"}"
write_repo "$HOME_DIR/sites/meow" \
  "README.md:# Meow" \
  "synth.js:export const meow = (pitch = 440) => Math.sin(pitch * 0.02)" \
  "package.json:{\"name\":\"meow\",\"private\":true,\"type\":\"module\"}"
write_repo "$HOME_DIR/sites/fish-screensaver-for-cats" \
  "README.md:# Fish Screensaver for Cats" \
  "index.html:<!doctype html><title>Fish</title><canvas id=\"fish\"></canvas>"

cat >/tmp/seed-repos.sh <<'SCRIPT'
set -euo pipefail
cd "$HOME"

init_repo() {
  local path=$1
  local message=$2
  cd "$path"
  git init -q -b main
  git config user.name "Harold Demo"
  git config user.email "harold-demo@example.invalid"
  git add -A
  git commit -q -m "$message"
  cd "$HOME"
}

init_repo "$HOME/sites/cat-screensaver" "Seed the cat screensaver"
git init -q --bare "$HOME/git/cat-screensaver.git"
git -C "$HOME/sites/cat-screensaver" remote add origin "$HOME/git/cat-screensaver.git"
git -C "$HOME/sites/cat-screensaver" push -q -u origin main
git -C "$HOME/sites/cat-screensaver" worktree add -q \
  "$HOME/sites/cat-screensaver-worktrees/cat-mode" -b feat/cat-mode

init_repo "$HOME/sites/moonlit-garden" "Start the moonlit garden"
init_repo "$HOME/sites/meow" "Start meow"
init_repo "$HOME/sites/fish-screensaver-for-cats" "Start the fish screensaver"
SCRIPT
chmod 755 /tmp/seed-repos.sh
chown gary:gary /tmp/seed-repos.sh
su -s /bin/bash gary -c "bash /tmp/seed-repos.sh"

log "seeding host state"
install -o gary -g gary -m 0644 \
  "$DEMO_HOME/seed/workspaces.json" "$HOME_DIR/.harold/workspaces.json"
install -o gary -g gary -m 0644 \
  "$DEMO_HOME/seed/agents.json" "$HOME_DIR/.harold/agents.json"

log "seeding agent history"
su -s /bin/bash gary -c \
  "python3 $DEMO_HOME/agent/fake_agent.py --seed"

log "installing fake agent commands"
write_agent() {
  local name=$1
  local agent=$2
  cat >"/usr/local/bin/$name" <<SCRIPT
#!/bin/sh
case "\$1 \$2" in
  "auth status") echo '{"loggedIn":true,"status":"authenticated"}'; exit 0 ;;
  "auth list") echo 'Logged in'; exit 0 ;;
esac
exec python3 $DEMO_HOME/agent/fake_agent.py $agent "\$@"
SCRIPT
  chmod 755 "/usr/local/bin/$name"
}

write_agent opencode opencode
write_agent claude claude-acp
write_agent codex-acp codex-acp

install -o root -g root -m 0755 "$DEMO_HOME/tools/gh" /usr/local/bin/gh

chown -R gary:gary "$HOME_DIR/.ssh" "$HOME_DIR/.harold" "$HOME_DIR/.harold-demo"

log "host key $(ssh-keygen -l -E sha256 -f /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}')"
log "ready on port 2222 as gary@demo-host"
exec /usr/sbin/sshd -D -e -p 2222
