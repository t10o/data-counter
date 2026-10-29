#!/usr/bin/env bash
# ビルドしてラズパイに送り、systemd のサービスとして（再）起動する。
#
#   cp deploy/.env.example deploy/.env   # DEPLOY_HOST を書く
#   pnpm deploy:pi
#
# ラズパイ側には asdf を入れておくこと（Node.js は .tool-versions の版をここで入れる）。
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f deploy/.env ]]; then
  # shellcheck source=/dev/null
  source deploy/.env
fi
: "${DEPLOY_HOST:?deploy/.env に DEPLOY_HOST（例: pi@raspberrypi.local）を書いてください}"
DEPLOY_DIR="${DEPLOY_DIR:-data-counter}"
NODE_VERSION="$(awk '$1 == "nodejs" { print $2 }' .tool-versions)"

echo "==> build"
pnpm build

echo "==> upload to $DEPLOY_HOST:$DEPLOY_DIR"
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR/data'"
# data/（データベース）と .env はラズパイにしかないので、--delete の対象に含めない
rsync -az --delete --relative \
  apps/server/dist/ \
  apps/web/dist/client/ \
  machines/ \
  deploy/data-counter.service \
  "$DEPLOY_HOST:$DEPLOY_DIR/"

echo "==> install and restart the service"
ssh "$DEPLOY_HOST" bash -s -- "$DEPLOY_DIR" "$NODE_VERSION" <<'REMOTE'
set -euo pipefail
dir="$(cd "$1" && pwd)"
node_version="$2"
export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$PATH"

if ! command -v asdf >/dev/null; then
  echo "asdf が見つかりません。README の「ラズパイの準備」を見てください" >&2
  exit 1
fi
asdf plugin list 2>/dev/null | grep -qx nodejs || asdf plugin add nodejs
asdf list nodejs 2>/dev/null | grep -q "$node_version" || asdf install nodejs "$node_version"
node_bin="$(asdf where nodejs "$node_version")/bin/node"

if [[ ! -f "$dir/.env" ]]; then
  echo "注意: $dir/.env がありません。INGEST_TOKEN なしで動きます（apps/server/.env.example を参照）" >&2
fi

sed -e "s|@USER@|$USER|g" -e "s|@DIR@|$dir|g" -e "s|@NODE@|$node_bin|g" \
  "$dir/deploy/data-counter.service" | sudo tee /etc/systemd/system/data-counter.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --quiet data-counter.service
sudo systemctl restart data-counter.service
sleep 2
systemctl is-active data-counter.service
REMOTE

echo "==> done (ログ: ssh $DEPLOY_HOST journalctl -u data-counter -f)"
