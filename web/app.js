

// web/app.js
// Purpose: Browser-side scaffold to visualize the actor.
// - Default: run actor directly in main thread (imports apps/simulation/build/*).
// - Optional: `?mode=worker` uses a dedicated Web Worker per actor via workerWrappers.
// The UI elements are provided by index.html (pure display). This file wires behavior.

const params = new URLSearchParams(location.search);
const MODE = params.get("mode") === "worker" ? "worker" : "local";

// --- DOM helpers ---
const $ = (id) => document.getElementById(id);
const el = {
  x: $("x"), y: $("y"), hp: $("hp"), sp: $("sp"), cd: $("cd"), eff: $("eff"),
  btnInit: $("init"), btnStep: $("step"), btnHeal: $("heal"), btnSpend: $("spend"),
  btnL: $("left"), btnR: $("right"), btnU: $("up"), btnD: $("down"),
  canvas: /** @type {HTMLCanvasElement} */ ($("grid")),
};
const ctx2d = el.canvas.getContext("2d");

// --- Rendering ---
function drawGrid() {
  const W = el.canvas.width, H = el.canvas.height;
  ctx2d.clearRect(0, 0, W, H);
  ctx2d.globalAlpha = 0.3;
  for (let i = 0; i <= W; i += 20) { ctx2d.beginPath(); ctx2d.moveTo(i, 0); ctx2d.lineTo(i, H); ctx2d.stroke(); }
  for (let j = 0; j <= H; j += 20) { ctx2d.beginPath(); ctx2d.moveTo(0, j); ctx2d.lineTo(W, j); ctx2d.stroke(); }
  ctx2d.globalAlpha = 1;
}

function drawActor(x, y) {
  const ax = x * 10 + 100;
  const ay = 100 - y * 10;
  ctx2d.beginPath(); ctx2d.arc(ax, ay, 5, 0, Math.PI * 2); ctx2d.fill();
}

function updateHUD(state) {
  el.x.textContent = String(state.x);
  el.y.textContent = String(state.y);
  el.hp.textContent = String(state.hp);
  el.sp.textContent = String(state.sp);
  el.cd.textContent = String(state.cd);
  el.eff.textContent = String(state.eff);
  drawGrid();
  drawActor(state.x, state.y);
}

// --- LOCAL MODE (no workers) ---
async function startLocal() {
  let mod;
  try { mod = await import("../apps/simulation/build/release.js"); } catch { mod = await import("../apps/simulation/build/debug.js"); }

  function snapshot() {
    return {
      x: mod.get_x(), y: mod.get_y(), hp: mod.get_hp(), sp: mod.get_sp(),
      cd: mod.get_cooldown(), eff: mod.get_effort(),
    };
  }

  // Wire controls
  el.btnInit.onclick = () => { mod.actor_init(); updateHUD(snapshot()); };
  el.btnStep.onclick = () => { mod.actor_step(); updateHUD(snapshot()); };
  el.btnHeal.onclick = () => { mod.heal(5); updateHUD(snapshot()); };
  el.btnSpend.onclick = () => { mod.spend(5); updateHUD(snapshot()); };
  el.btnL.onclick = () => { mod.nudge(-1, 0); updateHUD(snapshot()); };
  el.btnR.onclick = () => { mod.nudge(1, 0); updateHUD(snapshot()); };
  el.btnU.onclick = () => { mod.nudge(0, 1); updateHUD(snapshot()); };
  el.btnD.onclick = () => { mod.nudge(0, -1); updateHUD(snapshot()); };

  // Boot
  if (typeof mod.actor_init === "function") mod.actor_init();
  updateHUD(snapshot());
}

// --- WORKER MODE (dedicated actor thread) ---
async function startWorker() {
  const { DedicatedActorThread } = await import("./workerWrappers.js");
  const thread = new DedicatedActorThread();
  await thread.init("actor-1");

  thread.onMessage((e) => {
    const m = e.data;
    if (m && m.type === "snapshot") updateHUD(m.state);
  });

  // Wire controls: send commands via messages (tick/nudges) — for now, only tick
  el.btnInit.onclick = () => { /* init happened at thread.init */ };
  el.btnStep.onclick = () => { thread.tick(); };
  el.btnHeal.onclick = () => { console.warn("heal not yet routed in worker mode"); };
  el.btnSpend.onclick = () => { console.warn("spend not yet routed in worker mode"); };
  el.btnL.onclick = () => { console.warn("nudge not yet routed in worker mode"); };
  el.btnR.onclick = () => { console.warn("nudge not yet routed in worker mode"); };
  el.btnU.onclick = () => { console.warn("nudge not yet routed in worker mode"); };
  el.btnD.onclick = () => { console.warn("nudge not yet routed in worker mode"); };

  // Request first frame
  thread.tick();
}

// --- Entry ---
if (MODE === "worker") {
  startWorker().catch((e) => console.error("worker mode failed", e));
} else {
  startLocal().catch((e) => console.error("local mode failed", e));
}
