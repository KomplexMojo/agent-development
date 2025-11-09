export class ModeratorSummary {
  constructor(
    public tick: i32,
    public message: string,
  ) {}
}

export class ModeratorContext {
  tick: i32 = 0;
  summaries: Array<ModeratorSummary> = new Array<ModeratorSummary>();
  maxSummaries: i32 = 32;

  reset(): void {
    this.tick = 0;
    this.summaries = new Array<ModeratorSummary>();
  }

  addSummary(tick: i32, message: string): void {
    const summary = new ModeratorSummary(tick, message);
    this.summaries.push(summary);
    if (this.summaries.length > this.maxSummaries) {
      this.summaries.shift();
    }
  }

  getSummary(index: i32): ModeratorSummary | null {
    if (index < 0 || index >= this.summaries.length) return null;
    return unchecked(this.summaries[index]);
  }
}
