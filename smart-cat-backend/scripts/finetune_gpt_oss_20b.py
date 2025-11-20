#!/usr/bin/env python3
"""
QLoRA fine-tuning script for openai/gpt-oss-20b on Smart Cat pro dataset.

Usage:
  python scripts/finetune_gpt_oss_20b.py \
    --base-model /path/to/models/gpt-oss-20b \
    --train datasets/pro-finetune/train_hf.json \
    --val datasets/pro-finetune/val_hf.json \
    --output /path/to/output-dir
"""

import argparse
from pathlib import Path

from datasets import load_dataset
from transformers import (
    AutoConfig,
    AutoModelForCausalLM,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)
from transformers.trainer_utils import get_last_checkpoint

from peft import LoraConfig, get_peft_model


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune gpt-oss-20b with QLoRA.")
    parser.add_argument("--base-model", required=True, help="Path to base model directory.")
    parser.add_argument("--train", required=True, help="Train dataset JSON file (prompt/response).")
    parser.add_argument("--val", required=True, help="Validation dataset JSON file.")
    parser.add_argument("--output", required=True, help="Directory to store LoRA checkpoints.")
    parser.add_argument("--max-steps", type=int, default=600)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--eval-steps", type=int, default=50)
    parser.add_argument("--save-steps", type=int, default=100)
    parser.add_argument("--warmup-steps", type=int, default=50)
    parser.add_argument("--bf16", action="store_true", help="Use bf16 if supported.")
    parser.add_argument("--load-in-4bit", action="store_true", help="Attempt to load model in 4-bit.")
    parser.add_argument("--load-in-8bit", action="store_true", help="Attempt to load model in 8-bit.")
    return parser.parse_args()


def format_example(example, tokenizer, max_length=2048):
    text = example["prompt"] + example["response"] + tokenizer.eos_token
    tokens = tokenizer(text, truncation=True, max_length=max_length)
    return {"input_ids": tokens["input_ids"]}


def main():
    args = parse_args()

    base_model_path = Path(args.base_model)
    train_path = Path(args.train)
    val_path = Path(args.val)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    config = AutoConfig.from_pretrained(base_model_path)

    tokenizer = AutoTokenizer.from_pretrained(base_model_path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    dataset = load_dataset(
        "json",
        data_files={"train": str(train_path), "validation": str(val_path)},
    )
    tokenized = dataset.map(
        lambda ex: format_example(ex, tokenizer),
        remove_columns=["prompt", "response"],
    )

    loading_kwargs = {
        "device_map": "auto",
        "torch_dtype": "auto",
    }
    if args.load_in_4bit:
        loading_kwargs["load_in_4bit"] = True
    elif args.load_in_8bit:
        loading_kwargs["load_in_8bit"] = True

    quant_cfg = getattr(config, "quantization_config", None)
    if quant_cfg and (args.load_in_4bit or args.load_in_8bit):
        quant_method = ""
        if isinstance(quant_cfg, dict):
            quant_method = quant_cfg.get("quant_method", "")
        else:
            quant_method = getattr(quant_cfg, "quant_method", "")
        if quant_method and quant_method.lower() != "bitsandbytes":
            print(
                f"Warning: Base model already uses '{quant_method}' quantization; "
                "ignoring --load-in-4bit/--load-in-8bit flags to avoid conflicts."
            )
            loading_kwargs.pop("load_in_4bit", None)
            loading_kwargs.pop("load_in_8bit", None)

    model = AutoModelForCausalLM.from_pretrained(base_model_path, **loading_kwargs)

    lora_config = LoraConfig(
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.learning_rate,
        max_steps=args.max_steps,
        eval_strategy="steps",
        eval_steps=args.eval_steps,
        save_steps=args.save_steps,
        save_total_limit=2,
        warmup_steps=args.warmup_steps,
        logging_steps=10,
        bf16=args.bf16,
        num_train_epochs=1,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
    )

    last_ckpt = get_last_checkpoint(output_dir)
    if last_ckpt:
        trainer.train(resume_from_checkpoint=last_ckpt)
    else:
        trainer.train()

    trainer.save_model()
    print(f"Training completed. LoRA checkpoints saved to {output_dir}")


if __name__ == "__main__":
    main()
