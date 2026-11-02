# Pico WH のファームウェア

外部集中端子板（Ⅶ型）の CN2 の変化を GPIO の割り込みで拾い、時刻付きでサーバーに送る MicroPython のプログラムです。
数えたり判定したりはせず、立ち下がり・立ち上がりをすべて送ります。

| ファイル            | 中身                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `main.py`           | 起動すると動くメインループ                                               |
| `lib/capture.py`    | GPIO の割り込みで変化を拾い、リングバッファに積む                        |
| `lib/outbox.py`     | サーバーが受け取りを返すまでイベントを持っておく箱（連番・再送）         |
| `lib/ticks.py`      | 約 18 分で一周する `ticks_us()` を、一周しない時刻に直す                 |
| `lib/uplink.py`     | Wi-Fi への接続と送信                                                     |
| `config.example.py` | 設定の見本。`config.py` にコピーして使う（`config.py` はコミットしない） |

## 配線

```
CN2-1 (IN)   → GP21（27 番ピン）
CN2-2 (OUT)  → GP20（26 番ピン）
CN2-3 (外1)  → GP19（25 番ピン）
CN2-4 (外2)  → GP18（24 番ピン）
CN2-6 (COM)  → GND （23 番ピン）
CN2-7 (セキュリティ) → GP16（21 番ピン、いまは読まない）
GP17（22 番ピン）→ GND に直結
```

- 外付けの抵抗は使いません。GP18〜21 は内蔵プルアップ付きの入力にしています（`lib/capture.py`）
- 接点が閉じると Low になります（アクティブ Low）
- このプログラムは GPIO を出力にしません。GND に直結している GP17 は `PINS` に入れないでください
- GPIO の番号は `config.py` の `PINS` で変えられます。セキュリティ信号も読むときは `7: 16` を足します
- つなぐ前に、台の電源を入れた状態で、6 番と 1〜4 番の間が 0V であることをテスターで確かめてください

## 書き込み

### 1. MicroPython を入れる（最初の 1 回）

1. [MicroPython のダウンロードページ](https://micropython.org/download/RPI_PICO_W/) から `RPI_PICO_W` の `.uf2` を落とす
2. Pico の BOOTSEL ボタンを押しながら USB でつなぐ
3. `RPI-RP2` というドライブが出るので、`.uf2` をコピーする

### 2. mpremote を入れる

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r firmware/requirements-dev.txt
```

### 3. 設定を書いて送る

```sh
cp firmware/config.example.py firmware/config.py
# WIFI_SSID / WIFI_PASSWORD / SERVER_URL / INGEST_TOKEN を書く
./firmware/install.sh
```

`WIFI_SSID` を空にすると、Wi-Fi を使わずに USB シリアルにログを出すだけになります（配線の確認に便利です）。

## ログを見る

```sh
mpremote repl   # 抜けるときは Ctrl-]
```

```
data-counter: boot 9f3a1c2e pins {1: 21, 2: 20, 3: 19, 4: 18} levels [[1, 1], [2, 1], [3, 1], [4, 1]]
[    12.345678] #1 IN   fall
[    12.380712] #2 IN   rise  low 35.0 ms
```

- `low 35.0 ms` は、そのピンが Low（接点が閉じていた）だった時間、つまりパルス幅です
- Ctrl-C で止めると REPL に戻ります。`machine.reset()` か抜き差しで、また動き始めます

## 動き

- ループの中で割り込みのバッファを回収し、連番（seq）を振って送信待ちの箱に入れます
- イベントがあれば 100ms ごと、なければ 5 秒ごとにサーバーに POST します
- サーバーは保存できた最大の seq を返すので、それ以下を箱から捨てます。届かなければ次の回にもう一度送ります
- 箱がいっぱいになると古いものから捨て、その数を `dropped` として送ります（画面の「端子」で見られます）
- 基板の LED は Wi-Fi につながっている間だけ点きます
- `config.py` で `WATCHDOG = True` にすると、固まったときに自動で再起動します（設定が終わってから有効にしてください）

## テスト

`lib/outbox.py` と `lib/ticks.py` は MicroPython 専用のモジュールを使っていないので、パソコンの Python でテストできます。

```sh
pnpm test:firmware
```
