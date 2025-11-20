# Smart Cat Pro Fine-Tune Dataset

This folder contains curated chat examples for fine-tuning the Smart Cat Home **pro-tier** language model.

## Files

- `smart-cat-pro.jsonl` – conversation samples in OpenAI / Nexa-compatible JSONL format. Each line holds a `messages` array with `system`, `user`, and `assistant` roles.

## Dataset conventions

- **System prompt** always reminds the model of the Smart Cat Home persona and safety boundaries.
- **Users** ask for rich reasoning: trend analysis, calibration, complex reminders, or multilingual requests.
- **Assistants** respond with:
  - friendly yet expert tone
  - explicit references to sensor data, history, or schedules
  - clear, safe actionable steps
  - optional reminders or follow-ups when appropriate

These samples intentionally cover:

1. High humidity & comfort advice (ZH)
2. Air quality anomaly with preventative steps (EN)
3. Calibration reasoning with threshold tweaks (EN)
4. Low-light behavior reassurance (ZH)
5. Hydration reminder task creation (ZH)
6. Six-hour professional summary (EN)
7. Vision reasoning based on an uploaded photo (ZH)
8. Autoset hysteresis tuning (EN)
9. Memory logging for preferences (EN)
10. Gentle greetings, identity introductions, and reassurance chats without images (ZH/EN)
11. Image-acknowledgement checks to ensure the assistant only references photos when provided (ZH/EN)
12. Calm nightly briefings and morning prep summaries for low-alert scenarios (ZH/EN)
13. Quick Vitals troubleshooting（web / mobile）and follow-up reminders
14. Tool timeline + MCP analytics regression hand-offs for missed hydration alerts

Add more lines following the same structure to expand coverage (e.g., medication reminders, multi-cat households, serial bridge diagnostics).

## Preparing for fine-tuning

### 1. 再生資料（可選）

已提供 `scripts/generate-pro-dataset.mjs` 用於批次產生 100 組中文、100 組英文的專業對話範例。若想重新產生或擴充，只要執行：

```bash
node scripts/generate-pro-dataset.mjs
```

產出的 JSONL 會覆寫 `smart-cat-pro.jsonl`，內容覆蓋高濕度、校正、提醒、影像判讀、專業摘要等多種情境。

### 2. **Review & expand data**
   - Duplicate the JSONL template and append new conversations; each line must remain valid JSON.
   - Keep reply length near your target model context (e.g., 150–250 tokens) and emphasise the “pro” tone: cite metrics, offer mitigation steps, provide follow-up reminders.

3. **Split into train/validation**
```bash
head -n 8 datasets/pro-finetune/smart-cat-pro.jsonl > datasets/pro-finetune/train.jsonl
tail -n 1 datasets/pro-finetune/smart-cat-pro.jsonl > datasets/pro-finetune/val.jsonl
```
   Adjust counts as the dataset grows.

4. **Launch Nexa (OpenAI-compatible) fine-tuning**
   ```bash
   # Example using Nexa CLI (pseudo-command – adapt to your environment)
   nexa finetune create \
     --model NEXA_PRO_BASE \
     --train-file datasets/pro-finetune/train.jsonl \
     --validation-file datasets/pro-finetune/val.jsonl \
     --epochs 3 \
     --lr 1e-5 \
     --batch-size 2 \
     --suffix smart-cat-pro
   ```
   When the job finishes, note the generated model ID (e.g., `smart-cat-pro-finetuned`).

5. **Update backend configuration**
   - Set in `.env` (or deployment secrets):
     ```env
     LOCAL_LLM_PRO_MODEL_ID=smart-cat-pro-finetuned
     LOCAL_LLM_PRO_SERVER_MODEL=smart-cat-pro-finetuned
     ```
   - Restart the backend so `aiConfig` loads the new settings.

6. **Verify behaviour**
   - Interact with `/api/chat/suggestions` specifying challenging prompts.
   - Watch server logs (`SMART_CAT_AI_DEBUG=true`) to confirm the pro model is selected when expected and responses reflect the fine-tuned behaviour.

## Notes

- Nexa/OpenAI-compatible endpoints expect UTF-8 JSON lines; avoid trailing commas or comments.
- If training with other frameworks (e.g., `transformers` + LoRA), convert JSONL to the toolkit’s format beforehand.
- Store any private cat data outside the repo; keep this dataset anonymised or fictional for safety reviews.
