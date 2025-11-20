## DHT11 腳位設定（Mega vs UNO）

- **Mega 2560 預設**：`constexpr uint8_t DHT_PIN = 24;` → 將 DHT11 資料腳接到 **D24**。
- **UNO/Nano 接法**：請把 `DHT_PIN` 改成 `4`，並把資料腳接到 **D4**。

修改步驟：
1. 打開 `smart_cat_serial_bridge.ino`，找到 `DHT_PIN` 定義並設定成你要的數位腳位。
2. 重新上傳草稿。
3. 佈線時記得共地；若模組沒有內建上拉，資料腳需加 10k 上拉電阻。
