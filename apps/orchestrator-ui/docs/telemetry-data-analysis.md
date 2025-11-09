# telemetry-run.json efficiency review

## Observations

- The file stores:
  - `seed`: number for reproducible runs.
  - `summaries`: array of tick strings (verbose text summarizing outcomes).
  - `frames`: array of per-tick snapshots:
    - `tick`
    - `grid`: array of strings (ASCII rows)
    - `telemetry` block : includes directives/outcomes etc (unused in UI)
    - `actors`: array of objects {id,symbol,x,y,stamina, intent, tier...}
    - `portals` array of {x,y,type,symbol}
    - `stairs` array of {x,y,type,symbol}

- Current UI telemetry adapter fetches the entire file and keeps everything resident in memory.
- Rendering uses only `grid`, `actors`, `portals`, `stairs`, `tick`.
- Summaries displayed? (Not yet used in new UI).

## Redundancies and cost

- the `grid` array uses padded strings with '.' characters; for 57x25 grid, each tick stores 1,425 chars ~1.4 KB raw; with many ticks, file grows linearly. But ascii is easy to parse; replacing with RLE or storing as single string isn't huge benefit but possible.
- `actors` / `portals` / `stairs` repeated per tick even when static; barrier entries (actors with kind barrier) repeating each frame even if static.
- `summaries` repeats derived data; not necessary for canvas render.
- `telemetry` large text arrays; currently unused.

## Options to optimize

### 1. Streaming/ chunked loading
- For large runs, fetch and parse per tick (chunked) or separate metadata vs frames to avoid huge initial load.
- Use NDJSON or zipped response.

### 2. Static layers
- Split immobile structures (barriers, portals, stairs) into separate arrays outside frames if they never change; refer by ID in frames.
- Example:
```
{
  "seed": ...,
  "grid": { "width": 57, "height": 25 },
  "layers": {
     "terrain": "base ascii map or tile index; static",
     "portals": [...], "stairs": [...]
  },
  "frames": [
     { "tick": 1, "actors": [...] } // only movable elements
  ]
}
```
This reduces redundant data when static.

### 3. Numeric grid representation
- Instead of strings, store typed arrays:
  - `grid` as base64 encoded binary (tile codes).
  - Use `Uint8Array` per tile referencing palette; decompress client side.
- Gains if grid is large and characters are single char but zipped? zipped text already efficient though.

### 4. Differential frames
- Many frames differ only by small actor position changes. Use delta encoding between frames to reduce size:
```
"frames":[
  {"tick":0, "actors":[...full...]},
  {"tick":1, "delta":{"actors":[{"id":"a1","x":..,"y":..}]}}
]
```
Because barriers static, only actor positions change.
- Client reconstructs full state incrementally.

### 5. Remove unused telemetry
- If UI doesn't show `telemetry.directives/outcomes`, drop or load separately when needed.

### 6. Compression
- Serve `telemetry-run.json` gzipped (most HTTP servers do automatically). ensures minimal transfer.

### 7. Unique actor definitions
- actor info repeated per tick (stamina etc). Distinguish static metadata vs dynamic state to reduce duplication:
```
"actors": {"meta":{"a1":{"symbol":"α","role":"..."}},"frames":[{"stamina":...}]}
```
- If stamina changes each tick, keep in frames but other static fields (symbol role outcome?) might not.

## Proposed progressive structure

```
{
  "seed": 123,
  "grid": { "width": 57, "height": 25, "tiles": "string or base64" },
  "portals": [...],
  "stairs": [...],
  "actors": {
    "meta": {
       "a1": { "symbol": "α", "role": "mobile" }
    },
    "frames": [
      { "tick":0, "a1": { "x":10, "y":12, "stamina":100, "intent":"move" }, ... }
    ]
  }
}
```

# Implementation notes
- ensure compatibility with existing orchestrator by adjusting generator/writer.
- UI telemetry adapter normalizes incoming data so the render layer consumes a stable schema.
- Provide fallback for older data by detection.
- Evaluate zipped binary (zlib) for very large runs; may need Web Worker to parse.
