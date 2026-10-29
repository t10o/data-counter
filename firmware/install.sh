#!/usr/bin/env bash
# Pico に main.py・lib/・config.py を書き込んで再起動する。
# 先に MicroPython のファームウェア（RPI_PICO_W）を入れておくこと。手順は README.md
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f config.py ]]; then
  echo "firmware/config.py がありません。config.example.py をコピーして編集してください" >&2
  exit 1
fi

# lib/ がすでにあると mkdir は失敗するが、それでよい
mpremote fs mkdir :lib >/dev/null 2>&1 || true
mpremote fs cp lib/*.py :lib/ + fs cp main.py config.py : + reset
echo "書き込みました。ログを見るには: mpremote repl（抜けるときは Ctrl-]）"
