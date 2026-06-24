# Contributing 🤝

Thanks for helping improve Twellie on older and unsupported TV platforms.

## Ground rules

1. **TV code must be ES5.** Everything under `src/core`, `src/lang` and
   `src/platforms/{orsay,tizen}` runs on engines as old as 2013 Orsay WebKit. No
   arrow functions, `let`/`const`, template literals, `fetch`, `Promise`,
   `classList` or `class`. `npm run lint` enforces it. (The harness, the tests
   and `tools/` may use modern JS.)
2. **No runtime dependencies.** If you reach for an npm package for the app
   itself, there's probably a smaller hand-rolled way.
3. **Keep the core platform-agnostic.** TV-specific code belongs in an adapter
   (`src/platforms/<name>/`), behind the existing player/keys/system contract.

## Before you open a PR

```bash
npm run lint      # ES5 safety
npm test          # unit tests
npm start         # check it in the browser harness
```

## Adding a translation 🌍

Copy `src/lang/en.js`, translate the values, register your language code, and
add the `<script>` line to each platform's `index.html`. That's it.

## Touching the player or keys for a specific generation?

Note which model years you actually verified on in the PR — the device matrix in
[docs/PLATFORMS.md](docs/PLATFORMS.md) tracks what's been confirmed on real
hardware vs. built to spec.
