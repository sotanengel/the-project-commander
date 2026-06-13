export class CliJobQueue {
  private tail: Promise<void> = Promise.resolve();

  /** ジョブを直列実行する */
  enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.tail.then(job, job);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
