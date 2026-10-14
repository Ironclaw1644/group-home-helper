# The landing-page films

Four films, each a recording of the real demo sandbox with a frame and
captions around it. The page promises "nothing in them is a mockup", so the
rule is: **everything inside the phone's screen is footage**. The phone, the
9:41 status bar, the tap ring, the camera moves, the captions, the
"sped up" and "real time" pills and the intro/outro cards are overlays.

```
npm run films:record -- note        # note | form | setup | letterhead  (drives https://flipbrief.com)
npm run films:assemble -- note      # tmp/films/note -> films/public/note/{screen.mp4,events.json}
npm run films:render -- note        # -> public/demo/flipbrief-note.mp4, poster-note.jpg, flipbrief-note.vtt
node films/render.mjs --draft note  # half size, tmp/films/render/ only, for checking
```

- `scripts/films/record.ts` opens a sandbox through "Try it yourself" and
  drives it. It records with a CDP screencast at 3x (1170 px wide) and logs
  every tap and beat; it draws nothing on the page. FILMS_BASE points it
  elsewhere. The note and form films call the live model once each.
- `films/specs.json` is the edit: segments (anything between them is cut; a
  segment with `speed` is labelled with its speed and real length), captions
  (each with an optional camera `y` / `zoom`), the draft timer, and poster.
- `films/assemble.py` puts the screencast on a 30 fps clock and cuts it.
- `films/src/Film.tsx` is the Remotion composition.

Every caption has to be on screen in the app at that moment, or in
`memory/2026-09-09-flipbrief-claim-register.md`. No timing claims beyond what
the pill measures off the footage itself.

After a recut, update `length` in `components/marketing/films.tsx`.
