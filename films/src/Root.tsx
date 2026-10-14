import React from 'react';
import { Composition, staticFile } from 'remotion';
import { B0, Film, FPS, H, OUTRO, W, type Events } from './Film';

export const FLOWS = ['note', 'form', 'setup', 'letterhead'] as const;

export const Root: React.FC = () => (
  <>
    {FLOWS.map((flow) => (
      <Composition
        key={flow}
        id={flow}
        component={Film as React.FC<{ ev: Events }>}
        width={W}
        height={H}
        fps={FPS}
        durationInFrames={300}
        defaultProps={{ ev: null as unknown as Events }}
        calculateMetadata={async () => {
          // events.json is written by films/assemble.py beside the clip.
          const ev = (await (await fetch(staticFile(`${flow}/events.json`))).json()) as Events;
          return { props: { ev }, durationInFrames: B0 + Math.round(ev.seconds * FPS) + OUTRO };
        }}
      />
    ))}
  </>
);
