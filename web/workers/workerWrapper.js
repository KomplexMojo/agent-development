// Thin wrappers to manage dedicated and pooled workers from the main thread.
// Usage:
//   import { DedicatedActorThread, ActorWorkerPool } from "./web/workerWrappers.js";

export class DedicatedActorThread {
  constructor(url = new URL("./workers/actorWorker.js", import.meta.url)) {
    this.worker = new Worker(url, { type: "module" });
    this.ready = new Promise((resolve) => {
      const h = (e) => {
        if (e.data && e.data.type === "inited") {
          this.worker.removeEventListener("message", h);
          resolve();
        }
      };
      this.worker.addEventListener("message", h);
    });
  }

  init(id) {
    this.id = id;
    this.worker.postMessage({ type: "init", id });
    return this.ready;
  }

  tick() {
    this.worker.postMessage({ type: "tick", id: this.id });
  }

  onMessage(handler) {
    this.worker.onmessage = handler;
  }

  destroy() {
    this.worker.postMessage({ type: "destroy", id: this.id });
    this.worker.terminate();
  }
}

export class ActorWorkerPool {
  constructor(url = new URL("./workers/poolWorker.js", import.meta.url)) {
    this.worker = new Worker(url, { type: "module" });
    this.pendingInits = new Map();
    this.onmessage = null;

    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === "inited") {
        const res = this.pendingInits.get(m.id);
        if (res) {
          res();
          this.pendingInits.delete(m.id);
        }
      }
      if (this.onmessage) this.onmessage(e);
    };
  }

  addActor(id) {
    return new Promise((resolve) => {
      this.pendingInits.set(id, resolve);
      this.worker.postMessage({ type: "init", id });
    });
  }

  tickActor(id) {
    this.worker.postMessage({ type: "tick", id });
  }

  removeActor(id) {
    this.worker.postMessage({ type: "destroy", id });
  }
}