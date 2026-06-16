# Semantic Enrichment Prompt Template

**Version:** v1
**Created:** 2026-06-15
**Updated:** 2026-06-15

---

## Design Principle

This prompt is deliberately **open-ended**. We do NOT constrain the vision model to a fixed vocabulary
or slot-fill schema. The model describes whatever it considers salient — surface appearance, structural
composition, mood, evoked imagery, whatever it thinks matters.

Structure in the embedding space emerges from the joint behavior of the vision-LM + embedding model,
not from a pre-committed axis. This sidesteps the categorical bucket problem entirely.

---

## System Prompt

```
You are a visual analyst describing music visualizer frames. Your descriptions will be used to create
searchable embeddings, so be specific and vivid. Focus on what makes this visual unique.
```

---

## User Prompt (per frame set)

```
Describe this music visualizer preset based on these frames. Include:
- Visual appearance (shapes, patterns, textures, motion implied)
- Color palette and dominant hues
- Mood or atmosphere evoked
- Any specific imagery or metaphors it brings to mind

Be specific and vivid. 2-4 sentences.
```

---

## Example Output (what good descriptions look like)

**Good (specific, searchable):**
> "Pulsing cyan plasma with radial symmetry, hypnotic concentric rings expanding outward.
> Reminiscent of an underwater plasma cathedral with deep blue-green hues. Meditative
> and otherworldly atmosphere."

**Good (varied, captures unique aspects):**
> "Chaotic white particle explosion against black void, high-energy strobe-like bursts.
> Aggressive industrial aesthetic with sharp geometric fragments. Intense and frenetic,
> suited for hard electronic music."

**Bad (too generic):**
> "A colorful music visualization with moving shapes."

**Bad (slot-fill style we're avoiding):**
> "Symmetry: radial. Motion: expanding. Color: blue-green. Energy: medium."

---

## Notes for Implementation

1. **Input:** 1 middle frame per preset (PNG, 512×512) — llama3.2-vision only supports single image
2. **Output:** Single description string, 2-4 sentences
3. **No JSON schema** — raw description text only
4. **Descriptions that sound "wrong" to a human can still produce useful embeddings** — we're not
   classifying, we're producing inputs for similarity search

---

## Versioning

Any change to the system prompt, user prompt, or frame selection strategy requires bumping the
prompt version (v1 → v2) and regenerating all descriptions for consistency.
