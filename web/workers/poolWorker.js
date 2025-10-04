// Pooled worker: intended to manage many agents.
// NOTE: With current AssemblyScript exports we only have one module-level context,
// so this is a placeholder. The protocol already supports many agents by id.

let mod;
let ready = false;
const active = new Set(); // ids tracked in the pool

async function load() {
  if (ready) return;
  try {
    mod = await import("../../build/release.js");
  } catch {
    mod = await import("../../build/debug.js");
  }
  ready = true;
}

self.onmessage = async (e) => {
  const m = e.data;
  await load();

  if (m.type === "init") {
    // Placeholder: only create/reset module context once
    if (active.size === 0) {
      mod.agent_init();
    }
    active.add(m.id);
    postMessage({ type: "inited", id: m.id });
  }

  if (m.type === "tick") {
    // Future: select the right context by id
    mod.agent_step();
    postMessage({
      type: "snapshot",
      id: m.id,
      state: {
        x: mod.get_x(),
        y: mod.get_y(),
        hp: mod.get_hp(),
        sp: mod.get_sp(),
        cd: mod.get_cooldown(),
        eff: mod.get_effort(),
      },
    });
  }

  if (m.type === "destroy") {
    active.delete(m.id);
    postMessage({ type: "destroyed", id: m.id });
  }
};