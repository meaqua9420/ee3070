# AI_training

## 1. Chat Model (標準聊天模型)

- 模型：Qwen3-4B-Thinking（透過 Nexa CLI 以 GGUF 形式服務）。
- 功能：負責日常聊天、資料整合、快速摘要等一般使用情境。
- 訓練策略：
  1. 主要使用官方提供的推理能力，不另行微調，避免造成過度擬合或推理能力退化。
  2. 透過系統提示、工具描述與後端 guardrail 控制輸出品質。
- 防過度微調：保持模型原始能力，只在必要時靠提示工程輔助，不對核心模型進行多次調教。
- 工作流程：
  1. MLX/Nexa 端先拉取 `NexaAI/Qwen3-4B-Thinking-2507-merged`。
  2. 後端 (`LOCAL_LLM_MODEL_ID`) 指向該模型並設定溫度、top-p 等參數。
  3. 若遇到過長對話，前端會裁切歷史訊息（token-aware），避免模型上下文飄移。

## 2. Vision 模型（影像描述）

- 模型：`NexaAI/Qwen3-VL-4B-Instruct-GGUF`，以本地 HTTP API (mlx_lm.server) 提供推理。
- 功能：分析使用者上傳的照片，產出簡短描述與安全建議，並將結果整合回聊天。
- 訓練策略：
  1. 目前沿用既有權重，未做額外微調。
  2. 若後續要客製化，可收集自家照片與標註，再使用 MLX LoRA 或外部框架進行增量訓練。
- 防過度微調：保留原始 vision 能力，將 domain 特定規則交給聊天模型統整（例如「請提醒補水」等），避免把所有責任塞給 vision。
- 部署與環境：
  1. MLX server 指定 vision 模型與腳本 (`LOCAL_VISION_MODEL_ID`)。
  2. 後端 `analyzeImageWithQwen` 呼叫 vision server，轉為 system message 注入聊天。
  3. 加入 guardrail：失敗或超時時會 fallback，並在聊天中標註「無法分析」。

## 3. Pro Chat 模型（專業推理）

- 基底模型：`gpt-oss-20b`（mix-of-experts 架構）
- 最新訓練（2025-11-09）：MLX LoRA rank 32、640 iterations、batch size 1、grad_accum 8。最終模型（Iter 640）Train loss 0.034、Val loss 0.196，耗時約 65 分鐘，峰值記憶體 24.4 GB。權重輸出於 `/Users/meaqua/Desktop/EE3070/models/gpt-oss-20b-smart-cat-mlx-lora-v4`，同時保留 checkpoint `0000640_adapters.safetensors`。
- 資料集處理：
  1. 主檔 `smart-cat-backend/datasets/pro-finetune/smart-cat-pro.jsonl`，新增 Quick Vitals、工具流程、安心回報等情境，避免模型對任何短句都回「剛剛的影像顯示…」。
  2. 使用 `scripts/deduplicate_pro_dataset.py` 先去除完全重複與僅數值差異的高相似樣本，再以 `scripts/convert_jsonl_to_hf.py` 轉換為 Hugging Face 友善格式 (`train_hf.json`, `val_hf.json`)。
  3. 建議流程：先執行 `python3 scripts/deduplicate_pro_dataset.py` 取得乾淨資料，再使用 `wc -l datasets/pro-finetune/*.jsonl` 確認行數。
  4. 訓練/驗證/測試集分布（2025-11-09）：train 497、val 56、test 22（合計 575 筆），另有 `valid.jsonl` 64 筆作為額外 sanity check。
- 防過度微調策略：
  1. 僅採 LoRA，保留原始權重；目前建議 rank 32、dropout 0.05、scale 32（可視 VRAM 調整）。
  2. 啟用 gradient checkpoint + 較小 batch，維持訓練穩定並避免記憶體爆量。
  3. 維持資料多樣性（含影像語境、設定調整、危急情境），降低偏頗風險。
- 推理配置調整：
  - `POST /api/chat/suggestions` 現支援 `reasoningEffort` 參數，可選 `low`、`medium`、`high`，以控制 Pro 模型的 `reasoning_effort`、最大生成長度與逾時上限（預設 `high`）。標準聊天模型固定使用 `low` 以維持即時性。
- 訓練過程與遇到的 Issue：
  1. 初次嘗試使用 Hugging Face + bitsandbytes（CPU-only）時，因 `gpt-oss-20b` 為 MOE 架構，在 CPU 環境引發 `KeyError: model.layers.8.mlp.experts.gate_up_proj` 並中止。
  2. 改用 MLX LoRA (`mlx_lm.lora`) 搭配 Apple Silicon GPU（M3 Max）後訓練成功，最新 run 峰值記憶約 24.4 GB。
  3. 建議在專用 venv 內訓練：
     ```bash
     cd /Users/meaqua/Desktop/EE3070
     python3 -m venv venv-mlx-pro
     source venv-mlx-pro/bin/activate
     pip install --upgrade pip
     pip install mlx-lm==0.28.3 peft==0.10.0 transformers==4.40.1 datasets sentencepiece safetensors
     ```
  4. 執行訓練（約 60~70 分鐘，取決於 grad_accum 與 iters；Libressl `NotOpenSSLWarning` 屬正常訊息可忽略）：
     ```bash
     cd smart-cat-backend
     MLX_ENABLE_METAL=1 mlx_lm.lora -c scripts/mlx_lora_config.yaml
     ```
  5. 訓練完成後可透過 `loss` 曲線評估（建議目標 <1.8）。若出現記憶體壓力，可把 `grad_accumulation_steps` 改回 4 或 LoRA rank 調至 16。
  6. 合併並註冊 Nexa：
     ```bash
     python -m peft.utils.merge_peft_adapter \
       --inference_model /Users/meaqua/Desktop/EE3070/models/gpt-oss-20b \
       --adapter_path /Users/meaqua/Desktop/EE3070/models/gpt-oss-20b-smart-cat-mlx-lora-v4 \
       --save_path /Users/meaqua/models/gpt-oss-20b-smart-cat-mlx-merged

     python /path/to/llama.cpp/convert_hf_to_gguf.py \
       --model /Users/meaqua/models/gpt-oss-20b-smart-cat-mlx-merged \
       --outfile /Users/meaqua/models/gpt-oss-20b-smart-cat-mlx-merged/gguf/q4_0.gguf

     nexa pull NexaAI/gpt-oss-20b-GGUF \
       --model-hub localfs \
       --local-path /Users/meaqua/models/gpt-oss-20b-smart-cat-mlx-merged/gguf/q4_0.gguf \
       --model-type llm
     ```
  7. 若要保留 LoRA 即時推論流程，也可直接啟動 MLX 服務（目前 Pro 服務即使用此流程）：
     ```bash
     nohup ../venv/bin/mlx_lm.server \
          --model /Users/meaqua/Desktop/EE3070/models/gpt-oss-20b \
          --adapter-path /Users/meaqua/Desktop/EE3070/models/gpt-oss-20b-smart-cat-mlx-lora-v4 \
          --host 127.0.0.1 --port 18182 --temp 1.0 --top-p 0.9 --max-tokens 512 \
          >/tmp/mlx-pro.log 2>&1 &
     ```
  8. `./scripts/run_pro_server.sh` 已預先帶入上述模型路徑、adapter 與 18182 port，重新啟動時直接執行即可。

## 4. 防止模型過度幻覺（後端 guardrail）

- `smart-cat-backend/src/ai.ts` 新增：
  1. `isSimpleGreeting`：判斷只有簡短問候時不要自動切到 Pro。
  2. `isSuspiciousProOutput`：若 Pro 回覆提到影像／照片但本輪沒附件，直接落回標準模型。
- 這些邏輯不影響標準模型，只在 Pro path 上動態檢查，避免幻覺造成誤導。
- 新 LoRA + guardrail 互補：LoRA減少「影像幻覺」，guardrail防止殘留情境，雙重保護使用者體驗。

## 5. 訓練環境準備步驟

1. 建立 Python `venv` (`python3 -m venv venv && source venv/bin/activate`)。
2. 安裝依賴：`pip install -r smart-cat-backend/scripts/requirements.txt`（確保 `mlx-lm`, `datasets`, `transformers`, `peft` 都在）。
3. 準備訓練資料：放置於 `smart-cat-backend/datasets/pro-finetune/`，包含 train/val/test/valid JSONL；先執行 `python3 scripts/deduplicate_pro_dataset.py` 清理重複樣本。
4. 轉換為 HF JSON：
   ```bash
   ../venv/bin/python scripts/convert_jsonl_to_hf.py --input datasets/pro-finetune/train.jsonl --output datasets/pro-finetune/train_hf.json
   ../venv/bin/python scripts/convert_jsonl_to_hf.py --input datasets/pro-finetune/val.jsonl --output datasets/pro-finetune/val_hf.json
   ```
5. MLX LoRA 訓練：
   ```bash
   ../venv/bin/mlx_lm.lora -c scripts/mlx_lora_config.yaml
   ```
6. 預備伺服器：
   ```bash
   nohup ../venv/bin/mlx_lm.server --model ... --adapter-path ... --port 18182 --host 127.0.0.1 >/tmp/mlx-pro.log 2>&1 &
   ```
7. 後端 `.env` 更新至新 LoRA：
   ```env
   LOCAL_LLM_PRO_MODEL_ID=smart-cat-pro-mlx-v2
   LOCAL_LLM_PRO_SERVER_MODEL=default_model
   LOCAL_LLM_PRO_SERVER_URL=http://127.0.0.1:18182
   ```
8. 重啟後端 (`npm run dev`) 並透過 `/api/chat/suggestions` 測試。

## 6. Dataset 評價與建議

- 目前樣本量 575（train:497／val:56／test:22，另有 valid:64）；經 `deduplicate_pro_dataset.py` 及 Quick Vitals/工具時間線增補後，高相似樣本已移除，確保單一情境只保留具有實質差異的版本。
- 場景涵蓋濕度調控、補水提醒、能源管理、行為安撫與多語輸出；補水與高風險案例仍偏少，可持續補強。
- 建議：
  - 再加入多貓衝突、急診 escalation、硬體異常排查等高價值場景，保持 Pro 模型對罕見事件的敏感度。
  - 補充純繁中文輸出，平衡目前英語訊息偏多的現況。
  - 可擴充含「拒絕／不確定」的謙遜回答，維持安全邊界。
- 防止過度擬合：
  - LoRA rank 保持在 32；dropout 0.05 提供正規化。
  - 訓練 steps（640 iters）搭配早停檢查，必要時觀察 validation loss 再停止。
  - 維持多語、不同難度與正負面案例的比例，避免模型行為失衡。

## 7. Pro 模型訓練問題與解法

1. **CPU-only 限制**：最初使用 Hugging Face + bitsandbytes 在 CPU 上嘗試 QLoRA，因 `gpt-oss-20b` 的 MOE 層需 GPU 支援（`gate_up_proj` offloading），導致訓練初期即崩潰。
2. **解決方式**：改用 MLX LoRA 直接在 Apple Silicon GPU 上訓練，利用 MLX 的原生 MPS 支援，帶來穩定訓練流程。
3. **建議**：若後續需要更長訓練或更大模型，可以轉移到具備 NVIDIA GPU 的環境，或使用 MLX 的分布式功能；同時保留 LoRA v1 與 v2 權重以便回退。

## 8. 安全搜尋代理設定（實驗功能）

- 目的：讓聊天模型可透過 `searchWeb` 工具取得經過濾的網頁摘要，同時限制查詢長度與結果數量，降低 prompt injection 風險。
- 啟動方式：
  ```bash
  SMARTCAT_SEARCH_UPSTREAM="https://api.example.com/search" \
  SMARTCAT_SEARCH_API_KEY="your-upstream-key" \
  node scripts/safe_search_proxy.js
  ```
- 後端 `.env` 新增：
  ```env
  SMARTCAT_SEARCH_PROXY_URL=http://127.0.0.1:5858/search
  SMARTCAT_SEARCH_TIMEOUT_MS=8000
  ```
- 工具會把每筆結果裁成「標題 + 摘要 + URL」，模型在回答時需再次核對重點並引導使用者確認來源。

---

上述內容可作為簡報的重點逐項說明，展示我們如何在同一台 MacBook (M3 Max, 26GB RAM) 完成資料整備、後端防護與 LoRA 微調流程。任何後續想要補充的情境，都可以依照此流程再跑一次微調並更新後端設定。즐
