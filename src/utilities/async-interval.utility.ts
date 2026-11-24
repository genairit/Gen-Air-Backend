interface IAsyncInterval {
  delay: number;
  onError: () => void;
  work: () => Promise<void>;
}
export class AsyncInterval {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  constructor(private readonly options: IAsyncInterval) {}
  start(): void {
    this.timer = setInterval(this.run, this.options.delay);
    this.timer.unref();
  }
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.pending;
  }
  private run = (): void => {
    if (this.pending) {
      return;
    }

    this.pending = this.options
      .work()
      .catch(this.options.onError)
      .finally((): void => {
        this.pending = null;
      });
  };
}
