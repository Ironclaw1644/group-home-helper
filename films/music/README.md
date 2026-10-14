# The films' music

`theme.m4a` is the first 80 s of one instrumental theme, used by all four
films. `render.mjs` cuts it to each film's length, fades it in (1.2 s) and out
(3 s), normalises it to -20 LUFS with true peak at or under -1 dBTP, and muxes
it as AAC 128k.

Made locally with **ACE-Step 1.5** (MIT licence), on the MacBook worker
(M1 Max, MLX), 2026-10-14. Repo `ace-step/ACE-Step-1.5` at ca1e85f, main
model bundle: DiT `acestep-v15-turbo`, LM `acestep-5Hz-lm-1.7B`, VAE,
`Qwen3-Embedding-0.6B`. Script: `~/music/flipbrief_theme.py` on the worker.

- caption: "Calm, warm, modern instrumental background music for a software
  product demo. Soft felt piano and mellow Rhodes electric piano carry a
  simple hopeful melody, light fingerpicked acoustic guitar, warm round bass,
  airy pads, very light brushed drums and a soft shaker. Unhurried and
  reassuring, even dynamics from start to finish, no build-ups, no drops, no
  risers, no vocals, no choir."
- lyrics `[Instrumental]`, instrumental true; 90 bpm, D major, 4/4, 95 s
- 8 inference steps, guidance 1.0, LM thinking on (metas only, caption not
  rewritten)
- seed **1014**, picked from 1014 / 2026 / 4119 / 77

Why that seed: no voice in it (demucs vocal stem -68 LUFS against a -15 LUFS
mix), the most harmonic and least percussive of the four (HPSS
percussive/harmonic -3.5 dB), the steadiest (LRA 2.8 LU, no build or drop
before it ends at 89 s), and it starts straight away, which suits a 1.2 s
fade-in. The other three are still on the worker in `~/music/flipbrief/`.
