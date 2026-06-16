# Semantic Enrichment Model Versions

**Version:** v1.0
**Created:** 2026-06-15
**Updated:** 2026-06-15

This file pins the exact model versions used to generate semantic descriptions and embeddings.
Changing any of these versions requires re-generating all artifacts for consistency.

---

## Vision Model (Frame → Description)

| Field | Value |
|-------|-------|
| **Model** | Llama 3.2 Vision 11B |
| **Version** | `llama3.2-vision:11b` |
| **Inference Engine** | Ollama |
| **Quantization** | Default (4-bit) |
| **Context Length** | 128K tokens |
| **Notes** | Multi-image support limited to 1 image per request; good free-form descriptions |

### Fallback Options (if primary unavailable)
1. `llama3.2-vision:90b` — larger, more detailed, slower
2. `Qwen2.5-VL-7B-Instruct` via mlxcel — if mlxcel is installed
3. `Pixtral-12B-2409` — strong instruction-following

---

## Embedding Model (Description → Vector)

| Field | Value |
|-------|-------|
| **Model** | Nomic Embed Text |
| **Version** | `nomic-embed-text:latest` |
| **Output Dimensions** | 768 |
| **Inference Engine** | Ollama |
| **Max Sequence Length** | 8192 tokens |
| **Notes** | Open-source, Ollama-native, strong retrieval performance |

### Fallback Options
1. `BAAI/bge-base-en-v1.5` — via sentence-transformers
2. `google/embeddinggemma-300m` — if better quality needed

---

## Prompt Template

| Field | Value |
|-------|-------|
| **Version** | v1 |
| **File** | `PROMPT.md` |
| **Style** | Open-ended (no slot vocabulary) |

---

## Composite Version String

Format: `{vision_model}@{vision_version} + {embedding_model}@{embedding_version} + prompt@{prompt_version}`

**Current:** `llama3.2-vision-11b@v1.0 + nomic-embed-text@v1.0 + prompt@v1`

This string is stored in each fingerprint record as `semanticModelVersion` to track provenance.

---

## Re-evaluation Trigger

If more than 3 months elapse from the last update (2026-06-15), re-research model choice before
proceeding with large-scale enrichment. The VLM landscape moves fast.

---

## Hardware Requirements

| Step | Memory | Time (per preset) |
|------|--------|-------------------|
| Vision (Qwen2.5-VL-32B, 4-bit) | ~40GB VRAM | 0.5-2 sec/frame |
| Embedding (EmbeddingGemma) | <1GB | <50ms |

**Target hardware:** M4 Max (128GB unified memory, 40-core GPU)
