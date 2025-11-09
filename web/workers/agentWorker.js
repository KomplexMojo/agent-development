// Dedicated worker: owns exactly one actor context.
// Loads the AssemblyScript build and responds to init/tick/destroy.

let mod;
let ready = false;

async function load() {
  if (ready) return;
  try {
    mod = await import("../../apps/simulation/build/release.js");
  } catch {
    mod = await import("../../apps/simulation/build/debug.js");
  }
  ready = true;
}

self.onmessage = async (e) => {
  const m = e.data;
  await load();

  switch (m.type) {
    case "init": {
      mod.actor_init();
      postMessage({ type: "inited", id: m.id });
      break;
    }
    case "tick": {
      // (optional) apply observation frame here later
      mod.actor_step();
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
      break;
    }
    case "destroy": {
      postMessage({ type: "destroyed", id: m.id });
      // self.close(); // uncomment to fully terminate worker
      break;
    }
  }
};
