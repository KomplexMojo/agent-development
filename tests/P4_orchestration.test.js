/**
 * [REQ:P4-ORCH] Orchestration smoke test
 * Goal: Drive a miniature playfield with mobile and static agents, exercising
 * lifecycle, movement, observation, emission, and map building end-to-end.
 *
 * This is intentionally high level: it validates that the cleaned-up public
 * API can support a coordinated scenario without poking at WASM internals.
 *
 * Run:
 *   npm run asbuild
 *   npm test
 */

import assert from "node:assert/strict";

(async () => {
  let mod;
  try { mod = await import("../build/release.js"); } catch { mod = await import("../build/debug.js"); }

  const requiredFunctions = [
    "agent_lifecycle_create",
    "agent_lifecycle_destroy",
    "agent_lifecycle_init",
    "agent_lifecycle_step",
    "agent_transition_move_by",
    "agent_transition_move_level",
    "agent_transition_attempt_move",
    "agent_transition_set_obstacle",
    "agent_observation_get_x",
    "agent_observation_get_y",
    "agent_vitals_get_stamina_current",
    "agent_observation_set_capability",
    "agent_observation_set_radar_range",
    "agent_observation_get_adjacent_snapshot",
    "agent_observation_direction_get_offset",
    "agent_emission_get_message_queue_capacity",
    "agent_emission_send",
    "agent_emission_receive_next",
    "agent_emission_poll_receipt",
    "agent_vec2_read",
  ];

  for (const name of requiredFunctions) {
    assert.equal(typeof mod[name], "function", `${name} export should be a function`);
  }

  // Coerce exported globals to plain numbers for easier reuse.
  const constants = Object.freeze({
    archetypeMobile: expectNumber(mod.agent_archetype_mobile, "agent_archetype_mobile"),
    archetypeStatic: expectNumber(mod.agent_archetype_static_tile, "agent_archetype_static_tile"),
    capabilityEnhanced: expectNumber(mod.agent_observation_capability_enhanced, "agent_observation_capability_enhanced"),
    staminaInfinity: expectNumber(mod.agent_resource_infinity, "agent_resource_infinity"),
    directions: {
      north: expectNumber(mod.agent_observation_direction_north, "agent_observation_direction_north"),
      east: expectNumber(mod.agent_observation_direction_east, "agent_observation_direction_east"),
      south: expectNumber(mod.agent_observation_direction_south, "agent_observation_direction_south"),
      west: expectNumber(mod.agent_observation_direction_west, "agent_observation_direction_west"),
      northEast: expectNumber(mod.agent_observation_direction_north_east, "agent_observation_direction_north_east"),
      southEast: expectNumber(mod.agent_observation_direction_south_east, "agent_observation_direction_south_east"),
      southWest: expectNumber(mod.agent_observation_direction_south_west, "agent_observation_direction_south_west"),
      northWest: expectNumber(mod.agent_observation_direction_north_west, "agent_observation_direction_north_west"),
    },
    statusObserved: expectNumber(mod.agent_observation_adjacent_status_observed, "agent_observation_adjacent_status_observed"),
    statusUnknown: expectNumber(mod.agent_observation_adjacent_status_unknown, "agent_observation_adjacent_status_unknown"),
  });

  const directionOrder = [
    constants.directions.north,
    constants.directions.east,
    constants.directions.south,
    constants.directions.west,
    constants.directions.northEast,
    constants.directions.southEast,
    constants.directions.southWest,
    constants.directions.northWest,
  ];

  const toVec = (vec) => mod.agent_vec2_read(vec);

  // --- Scenario setup -------------------------------------------------------

  const mobiles = [
    { name: "scout", handle: mod.agent_lifecycle_create(constants.archetypeMobile), path: [ [1,0], [1,0], [0,1], [0,1] ] },
    { name: "runner", handle: mod.agent_lifecycle_create(constants.archetypeMobile), path: [ [-1,0], [0,-1], [-1,0], [0,-1] ] },
  ];

  const statics = [
    { name: "pillar", handle: mod.agent_lifecycle_create(constants.archetypeStatic), pos: { x: 2, y: 1 }, blocking: true },
    { name: "relay", handle: mod.agent_lifecycle_create(constants.archetypeStatic), pos: { x: -1, y: -1 }, blocking: false },
  ];

  const allHandles = [ ...mobiles.map((m) => m.handle), ...statics.map((s) => s.handle) ];

  try {
    // Initialise everyone and place them on the board.
    for (const handle of allHandles) {
      mod.agent_lifecycle_init(handle);
    }

    for (const staticTile of statics) {
      mod.agent_transition_set_obstacle(staticTile.handle, staticTile.blocking);
      teleportTo(staticTile.handle, staticTile.pos.x, staticTile.pos.y);
    }

    teleportTo(findMobile("scout").handle, 0, 0);
    teleportTo(findMobile("runner").handle, 4, 4);

    // Give mobiles enhanced perception and radar range 3.
    for (const mobile of mobiles) {
      mod.agent_observation_set_capability(mobile.handle, constants.capabilityEnhanced);
      mod.agent_observation_set_radar_range(mobile.handle, 3);
      mod.agent_lifecycle_step(mobile.handle);
    }

    const mapByAgent = new Map(); // agent name -> Map<'x,y', sight record>
    const emissionLog = new Map(); // agent name -> array of messages

    // Baseline observations before starting scripted movement.
    for (const mobile of mobiles) {
      const view = new Map();
      mapByAgent.set(mobile.name, view);
      const updates = harvestObservation(mobile.handle, view);
      broadcastUpdates(mobile.handle, updates);
    }

    const ticks = 6;
    for (let tick = 0; tick < ticks; tick++) {
      // Advance each mobile according to its scripted path, respecting stamina.
      for (const mobile of mobiles) {
        const [dx, dy] = mobile.path[tick % mobile.path.length];
        attemptMoveWithFallback(mobile.handle, dx, dy);
      }

      // Static agents stay put but still step to keep introspection metadata fresh.
      for (const staticTile of statics) {
        mod.agent_lifecycle_step(staticTile.handle);
      }

      // Update observation-based maps and share intel via emission.
      for (const mobile of mobiles) {
        const view = mapByAgent.get(mobile.name);
        const newlyObserved = harvestObservation(mobile.handle, view);
        broadcastUpdates(mobile.handle, newlyObserved);
      }

      // Each mobile consumes the inbox and updates internal maps based on messages.
      for (const mobile of mobiles) {
        const intake = emissionLog.get(mobile.name) ?? [];
        emissionLog.set(mobile.name, intake);
        while (true) {
          const message = mod.agent_emission_receive_next(mobile.handle);
          if (message === null) break;
          intake.push({ tick, from: message.fromHandle, tag: message.tag });

          const decoded = decodeCoord(message.tag);
          const view = mapByAgent.get(mobile.name);
          if (view) {
            const key = `${decoded.x},${decoded.y}`;
            const baseline = view.get(key) ?? { status: constants.statusUnknown };
            view.set(key, { ...baseline, viaEmission: true, from: message.fromHandle });
          }
        }
      }

      // Record receipts so senders know deliveries succeeded.
      for (const mobile of mobiles) {
        while (mod.agent_emission_poll_receipt(mobile.handle) !== null) {
          // Snapshot already updated maps via emission_log; no extra handling needed for scaffold.
        }
      }
    }

    // --- Assertions --------------------------------------------------------

    const scoutView = mapByAgent.get("scout");
    const runnerView = mapByAgent.get("runner");
    assert.ok(scoutView && scoutView.size > 0, "scout should have accumulated observations");
    assert.ok(runnerView && runnerView.size > 0, "runner should have accumulated observations");

    // Scout should know about the pillar obstacle (2,1) via observation.
    const pillarKey = `2,1`;
    const pillarRecord = scoutView.get(pillarKey);
    assert.ok(pillarRecord && pillarRecord.status === constants.statusObserved, "scout should classify pillar tile");

    // Runner should have received at least one emission-based update about scout.
    const runnerInbox = emissionLog.get("runner") ?? [];
    assert.ok(runnerInbox.length > 0, "runner should receive positional broadcasts");
    const broadcastCoord = decodeCoord(runnerInbox[runnerInbox.length - 1].tag);
    assert.ok(Number.isInteger(broadcastCoord.x) && Number.isInteger(broadcastCoord.y), "emission payload should decode to coordinates");

    // Both agents should have a consistent view of static relay (non-blocking) tile via observation history.
    const relayKey = `-1,-1`;
    assert.ok(runnerView.get(relayKey), "runner should have relay tile in map");
    assert.ok(scoutView.get(relayKey), "scout should have relay tile in map");

    // Produce a simple text visualization for debugging.
    const visualization = renderMap(scoutView, "scout");
    console.log("[REQ:P4-ORCH] orchestration map (scout view):\n" + visualization.join("\n"));

    console.log("[REQ:P4-ORCH] orchestration test: ok");
  } finally {
    for (const handle of allHandles) {
      try { mod.agent_lifecycle_destroy(handle); } catch { /* ignore */ }
    }
  }

  // --- Helpers ------------------------------------------------------------

  function expectNumber(value, label) {
    if (typeof value === "number") return value;
    if (value && typeof value.valueOf === "function") {
      const numeric = Number(value.valueOf());
      if (Number.isFinite(numeric)) return numeric;
    }
    throw new TypeError(`${label} should expose a numeric value`);
  }

  function findMobile(name) {
    const entry = mobiles.find((m) => m.name === name);
    if (!entry) throw new Error(`Unknown mobile ${name}`);
    return entry;
  }

  function teleportTo(handle, x, y) {
    const current = {
      x: mod.agent_observation_get_x(handle),
      y: mod.agent_observation_get_y(handle),
    };
    mod.agent_transition_move_by(handle, x - current.x, y - current.y);
    mod.agent_lifecycle_step(handle);
  }

  function attemptMoveWithFallback(handle, dx, dy) {
    if (dx === 0 && dy === 0) {
      mod.agent_lifecycle_step(handle);
      return;
    }

    const before = {
      x: mod.agent_observation_get_x(handle),
      y: mod.agent_observation_get_y(handle),
      stamina: mod.agent_vitals_get_stamina_current(handle),
    };

    mod.agent_transition_move_by(handle, dx, dy);
    mod.agent_lifecycle_step(handle);

    const after = {
      x: mod.agent_observation_get_x(handle),
      y: mod.agent_observation_get_y(handle),
      stamina: mod.agent_vitals_get_stamina_current(handle),
    };

    const moved = after.x === before.x + dx && after.y === before.y + dy;
    const staminaSpent = after.stamina < before.stamina;

    if (moved || staminaSpent) {
      return;
    }

    // Fallback: try axis-aligned moves if diagonal or blocked move failed without cost.
    if (dx !== 0) {
      mod.agent_transition_move_by(handle, Math.sign(dx), 0);
      mod.agent_lifecycle_step(handle);
    }
    if (dy !== 0) {
      mod.agent_transition_move_by(handle, 0, Math.sign(dy));
      mod.agent_lifecycle_step(handle);
    }
  }

  function harvestObservation(handle, view) {
    const baseX = mod.agent_observation_get_x(handle);
    const baseY = mod.agent_observation_get_y(handle);
    const updates = [];

    for (const dir of directionOrder) {
      const snapshot = mod.agent_observation_get_adjacent_snapshot(handle, dir);
      const offset = toVec(mod.agent_observation_direction_get_offset(dir));
      const key = `${baseX + offset.x},${baseY + offset.y}`;

      if (snapshot.status === constants.statusObserved) {
        const existing = view.get(key);
        const wasObserved = existing && existing.viaObservation;
        view.set(key, {
          status: snapshot.status,
          observedHandle: snapshot.observedHandle,
          viaObservation: true,
        });
        if (!wasObserved) {
          updates.push({ x: baseX + offset.x, y: baseY + offset.y });
        }
      } else if (!view.has(key)) {
        view.set(key, { status: constants.statusUnknown });
      }
    }

    return updates;
  }

  function broadcastUpdates(senderHandle, tiles) {
    if (tiles.length === 0) return;
    const sender = mobiles.find((m) => m.handle === senderHandle);
    const target = mobiles.find((m) => m.handle !== senderHandle);
    if (!sender || !target) return;

    for (const tile of tiles) {
      const tag = encodeCoord(tile.x, tile.y);
      mod.agent_emission_send(sender.handle, target.handle, 12, 0, 0, tag);
    }
  }

  function encodeCoord(x, y) {
    const bias = 0x4000;
    const packedX = (x + bias) & 0xffff;
    const packedY = (y + bias) & 0xffff;
    return (packedX << 16) | packedY;
  }

  function decodeCoord(tag) {
    const bias = 0x4000;
    const x = ((tag >>> 16) & 0xffff) - bias;
    const y = (tag & 0xffff) - bias;
    return { x, y };
  }

  function renderMap(viewMap, label) {
    const cells = Array.from(viewMap.entries());
    if (cells.length === 0) return ["(no data)"];
    const xs = cells.map(([key]) => Number(key.split(",")[0]));
    const ys = cells.map(([key]) => Number(key.split(",")[1]));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const rows = [];
    for (let y = maxY; y >= minY; y--) {
      let row = "";
      for (let x = minX; x <= maxX; x++) {
        const cell = viewMap.get(`${x},${y}`);
        if (!cell) {
          row += " ";
        } else if (cell.viaObservation) {
          row += cell.observedHandle ? "O" : "?";
        } else if (cell.viaEmission) {
          row += "M";
        } else {
          row += ".";
        }
      }
      rows.push(row);
    }
    rows.push(`legend: O=observed, M=message, .=unknown`);
    rows.push(`map holder: ${label}`);
    return rows;
  }
})();
