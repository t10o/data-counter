# このファイルを config.py にコピーして使う。config.py には Wi-Fi のパスワードが入るのでコミットしない

# Wi-Fi（Pico W は 2.4GHz のみ）。空にすると Wi-Fi を使わず、USB シリアルにログを出すだけになる
WIFI_SSID = ""
WIFI_PASSWORD = ""
WIFI_COUNTRY = "JP"

# 受け口のサーバー（apps/server）の URL。ラズパイの IP アドレスにする
SERVER_URL = "http://192.168.1.100:3012/api/ingest"
# サーバーの .env の INGEST_TOKEN と同じ値
INGEST_TOKEN = ""

# 画面に出る端末の名前。Wi-Fi のホスト名にもなる
DEVICE_ID = "pico-datacounter"

# CN2 のピン番号 -> Pico の GPIO 番号。どれも内蔵プルアップ付きの入力にする
#   GP21〜18 は Pico の 27〜24 番ピン。隣の 23 番ピンが GND
#   GP17（22 番ピン）は GND に直結しているので、ここには入れない（このプログラムは GPIO を出力にしない）
#   GP16（21 番ピン）はセキュリティ信号（CN2-7）。読むときは 7: 16 を足す
PINS = {1: 21, 2: 20, 3: 19, 4: 18}
# USB シリアルのログに出す名前
PIN_NAMES = {1: "IN", 2: "OUT", 3: "EXT1", 4: "EXT2"}

# 変化を 1 行ずつ USB シリアルに出す（配線の確認用）
SERIAL_LOG = True
# 固まったら自動で再起動する。有効にすると mpremote で止めたときにも再起動するので、設定が終わってから True にする
WATCHDOG = False
# Wi-Fi が切れている間に持っておけるイベントの数（1 件 14 バイト）
OUTBOX_SIZE = 2000
