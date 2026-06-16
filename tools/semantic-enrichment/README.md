# Semantic Enrichment Pipeline

**Phase 6: Semantic Enrichment for Preset Selection**

Adds free-form vision-LM descriptions and text embeddings to presets, enabling continuous semantic similarity matching in addition to categorical filters.

## Pipeline Steps

```bash
# 1. Render preset frames (requires browser)
node tools/render-preset-frames.js --pack alaska-butter --outputDir presets/alaska-butter/frames

# 2. Generate descriptions via vision LLM
node tools/semantic-enrichment/describe-presets.js --pack alaska-butter

# 3. Generate embeddings from descriptions
node tools/semantic-enrichment/embed-descriptions.js --pack alaska-butter

# 4. Run quality gates
node tools/semantic-enrichment/test-retrieval-quality.js --pack alaska-butter --auto
node tools/semantic-enrichment/test-cluster-separation.js --pack alaska-butter

# 5. Merge into fingerprints
node tools/semantic-enrichment/merge-semantic-data.js --pack alaska-butter
```

## Quality Gates

| Gate | Threshold | alaska-butter Result |
|------|-----------|---------------------|
| Retrieval Quality | >= 3.5/5 | 3.90 PASSED |
| Cluster Separation | >= 0.15 | 0.0657 FAILED |

The cluster separation failure indicates descriptions are too formulaic. Consider revising the prompt or using a different embedding model for production. Retrieval quality passing means semantic search queries return relevant results.

## Model Versions

See `MODELS.md` for pinned model versions. Current: `llama3.2-vision-11b@v1.0 + nomic-embed-text@v1.0 + prompt@v1`

## Output Structure

Enriched fingerprints include:
```json
{
  "fingerprint": {
    "semantic": {
      "semanticModelVersion": "llama3.2-vision-11b@v1.0 + nomic-embed-text@v1.0 + prompt@v1",
      "description": "...",
      "embedding": [768 floats]
    },
    "embedding": [768 floats]  // top-level copy for matcher access
  }
}
```

## Matcher Integration

`src/taxonomy/embeddingScore.js` computes cosine similarity between query embedding and preset embeddings. Weight: 5% in Stage 2 scoring. Graceful fallback to 0 when either embedding is missing.

## Time Estimates

- Frame rendering: ~1 sec/preset
- Vision description: ~17 sec/preset (llama3.2-vision:11b via Ollama)
- Embedding generation: <1 sec/preset
- Full pipeline for alaska-butter (388 presets): ~2 hours
- Full pipeline for butterchurnPresetsAll (21,687 presets): ~100+ hours
