# The social card 500: root cause, and what to do about it

**Status: root-caused 29 August 2026. Not yet fixed. The fix is a decision, and
it is stated at the bottom.**

Every social card download answers **HTTP 500 with a zero-byte body**: three
formats across six channels, eighteen artefacts an organiser is offered on the
Launch Kit and cannot download.

---

## The finding, in one line

**`@vercel/og` rasterises by handing the SVG to `sharp`, and inside the Next
server runtime this `sharp` cannot decode SVG at all, while claiming that it
can.**

---

## The evidence, in the order it was gathered

### 1. It is not the environment

The first run was on a machine whose build directory OneDrive had demonstrably
corrupted (a conflict copy named `CURRENT-Lawal` inside the Turbopack cache broke
a build outright). That made "the cards are broken" impossible to separate from
"this build is damaged".

Re-run on a **clean checkout off the synced drive** (`C:/el-clean`), fresh
`npm ci`, fresh build: **all eighteen still 500.** The environment is exonerated.

### 2. The failing call is inside @vercel/og, not in our card code

The route was instrumented, because a zero-byte 500 is the least debuggable
thing it can produce. The stack:

```
at Sharp.toBuffer (node_modules/sharp/dist/output.mjs:159)
at render (node_modules/next/dist/compiled/@vercel/og/index.node.js:21420)
at async Object.start (.../index.node.js:21475)
```

### 3. What @vercel/og actually does, from its own compiled source

```js
async function getSharp() {
  if (_sharp) return _sharp
  try { _sharp = (await import("sharp")).default } catch (e) { return void 0 }
  return _sharp
}

async function render(satori2, resvg, sharp, opts, defaultFonts, element) {
  const svg = await satori2(element, { ... })
  let pngBuffer
  if (sharp) {
    pngBuffer = await sharp(new TextEncoder().encode(svg)).resize(options.width).png().toBuffer()
  } else {
    const resvgJS = new resvg.Resvg(svg, { ... })
    ...
  }
}
```

Two things follow, and both matter:

- It **prefers sharp** and rasterises by handing sharp the **SVG bytes**.
- It falls back to **resvg-wasm only when `import("sharp")` throws**. `getSharp()`
  is called unconditionally from the `ImageResponse` constructor, so
  **there is no option, flag or config to choose the rasteriser.**

### 4. Everything else was eliminated

| Hypothesis | Result |
|---|---|
| Our card input is malformed | **No.** The real `loadArtefactContext` + `toCardInput` for the real failing event renders fine outside `next start`. |
| The cover photograph is too large | **No.** A 200x120 cover fails identically. |
| The typographic (no-cover) path works | **Untestable, and itself a finding:** the database refuses a published event with no cover (`events_published_real_cover`), so every organiser card embeds a photograph. |
| Wrong sharp version, or a nested copy | **No.** One sharp, 0.35.3, plus `@img/sharp-win32-x64`. No nested copies. |
| sharp is being bundled and broken by Next | **No.** `sharp` is on Next's default auto-externalised list, so it is `require`d natively. Primary source: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`, which lists `sharp` at line 89. |
| vitest loads a different @vercel/og entry, so my passing tests measured resvg | **No.** `node_modules/next/dist/server/og/image-response.js` picks `index.edge.js` only when `process.env.NEXT_RUNTIME === 'edge'`. It is unset under vitest, so both used `index.node.js` and the same sharp branch. The passing tests are valid. |

### 5. The measurement that closes it

A capability probe was added to the route's failure path, so sharp is asked about
itself **from inside the Next server**:

```
sharpVersion (libvips): 8.18.3
svgInput:               {"file":true,"buffer":true,"stream":true,"fileSuffix":[".svg",".svgz",".svg.gz"]}
svgRoundTrip:           FAILED: Input buffer contains unsupported image format
```

The round trip is an **8x8 red rectangle**. Nothing about our cards.

The identical sharp, in a plain Node process in the same worktree, converts that
same SVG to a 470-byte PNG without complaint.

So:

- **sharp's `format.svg.input` table says SVG input is supported. It is static
  metadata, not a live probe of the loaded libvips, and inside this runtime it is
  simply wrong.**
- libvips decodes SVG through **librsvg**, loaded as a dynamic module beside the
  prebuilt binary. Inside the Next server it is not being loaded, so libvips
  cannot identify an SVG buffer, and "unsupported image format" is exactly what
  it says when it cannot identify a buffer.

That is the whole failure: satori produces good SVG, and the rasteriser it is
handed to cannot read SVG in this runtime.

---

## Can it be fixed in @vercel/og?

**No.** `getSharp()` is unconditional and the branch is `if (sharp)`. There is no
option, environment variable or config to prefer resvg. The only way to reach the
resvg path through that library is to make `import("sharp")` throw, and sharp is
a real, needed dependency of this platform (the upload pipeline is built on it),
so it cannot be removed or shadowed.

---

## The alternative, which is what should be built

**Stop using `ImageResponse` for the cards and rasterise with resvg ourselves.**

That is not a workaround; it is the same code path @vercel/og uses when sharp is
absent, taken deliberately instead of by accident:

1. Call **satori** directly with the element and fonts `renderSocialCard`
   already builds, to get the SVG. Nothing about the card composition changes.
2. Rasterise the SVG with **resvg-wasm**, which is WebAssembly and therefore
   behaves identically in every runtime, with no native module, no DLL search
   path and no librsvg to go missing.
3. Convert the resulting PNG to JPEG with sharp, which is what
   `renderSocialCard` already does and which works everywhere, because **PNG
   decoding is built into libvips and needs no dynamic module**.

Only step 2 changes. The composition, the fonts, the sizes and the JPEG output
are untouched.

**Why this is the right shape rather than pinning a sharp version:** it removes
the platform's dependence on a native decoder for a job that has a WASM
implementation shipping in the same package. A rasteriser that works in one
runtime and not another is a rasteriser that will differ between local, preview
and production, and this failure is exactly that difference.

**Cost and risk.** One function, `renderSocialCard` in
`src/lib/broadcast/social-cards.tsx`. `tests/unit/broadcast/social-card-renders.test.ts`
already asserts a decodable JPEG at every published size in both compositions, so
the swap has a gate waiting for it. It needs its own verification pass against a
running server, which is why it is not being done in the same breath as the
diagnosis.

---

## What is already fixed

The route no longer fails silently. The render is wrapped, the real error is
captured with the format and channel that asked for it, and the response is a
named refusal (`render_failed`) rather than a zero-byte body. That instrumentation
is what produced every measurement above.
