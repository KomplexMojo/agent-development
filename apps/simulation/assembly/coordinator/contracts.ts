export class CoordinatorContext {
  tick: i32 = 0;
  pendingRequests: Array<string> = new Array<string>();
  resolvedActions: Array<string> = new Array<string>();
  summaries: Array<string> = new Array<string>();
  configuratorHandle: i32 = 0;
  directorHandle: i32 = 0;
  moderatorHandle: i32 = 0;
  dispatchQueueHandle: i32 = 0;
  dispatchResults: Array<CoordinatorDispatchResult> = new Array<CoordinatorDispatchResult>();

  reset(): void {
    this.tick = 0;
    this.pendingRequests = new Array<string>();
    this.resolvedActions = new Array<string>();
    this.summaries = new Array<string>();
    this.configuratorHandle = 0;
    this.directorHandle = 0;
    this.moderatorHandle = 0;
    this.dispatchQueueHandle = 0;
    this.dispatchResults = new Array<CoordinatorDispatchResult>();
  }
}

export class CoordinatorDispatchResult {
  constructor(
    public actorHandle: i32,
    public dx: i32,
    public dy: i32,
    public tier: i32,
    public outcome: i32,
    public rejection: i32,
    public solverCode: i32,
    public aiuMode: i32,
    public aiuAux: i32,
    public cultivationTicks: i32,
    public vulnerabilityTicks: i32,
  ) {}
}
