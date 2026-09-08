import type { IClock, IIdGenerator } from "@fun-chess/shared";

export class MockClock implements IClock {
  private currentTime: number;

  constructor(initialTime: number = 1700000000000) {
    this.currentTime = initialTime;
  }

  public now(): number {
    return this.currentTime;
  }

  public advance(ms: number): void {
    this.currentTime += ms;
  }

  public set(time: number): void {
    this.currentTime = time;
  }
}

export class MockIdGenerator implements IIdGenerator {
  private counter: number = 0;
  private readonly predefinedIds: string[];

  constructor(predefinedIds: string[] = []) {
    this.predefinedIds = [...predefinedIds];
  }

  public generateId(): string {
    if (this.predefinedIds.length > 0) {
      return this.predefinedIds.shift()!;
    }
    this.counter += 1;
    return `test-id-${this.counter}`;
  }

  public generateRandomInt(min: number, _max: number): number {
    return min;
  }
}
