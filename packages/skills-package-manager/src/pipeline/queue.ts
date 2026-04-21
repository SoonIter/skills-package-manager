type TaskRecord<TTask, TResult> = {
  task: TTask
  resolve: (value: TResult) => void
  reject: (reason: unknown) => void
}

export interface TaskQueue<TTask, TResult> {
  enqueue(task: TTask): Promise<TResult>
  drain(): Promise<void>
  pause(): void
  resume(): void
  onBackpressure(callback: () => void): void
  onDrain(callback: () => void): void
  get pendingCount(): number
  get runningCount(): number
}

export function createTaskQueue<TTask, TResult>(
  processor: (task: TTask) => Promise<TResult>,
  options: { concurrency: number; maxPending?: number },
): TaskQueue<TTask, TResult> {
  const { concurrency, maxPending = Number.POSITIVE_INFINITY } = options
  const pending: TaskRecord<TTask, TResult>[] = []
  const running = new Set<Promise<void>>()
  let drained = true
  let paused = false
  const backpressureCallbacks: (() => void)[] = []
  let drainCallbacks: (() => void)[] = []

  function checkBackpressure() {
    if (pending.length >= maxPending && !paused) {
      backpressureCallbacks.forEach((cb) => {
        cb()
      })
    }
  }

  function checkDrain() {
    if (pending.length === 0 && running.size === 0 && !drained) {
      drained = true
      drainCallbacks.forEach((cb) => {
        cb()
      })
    }
  }

  async function runNext(record: TaskRecord<TTask, TResult>, promise: Promise<void>) {
    try {
      const result = await processor(record.task)
      record.resolve(result)
    } catch (error) {
      record.reject(error)
    } finally {
      running.delete(promise)
      processQueue()
      checkDrain()
    }
  }

  function processQueue() {
    if (paused) return
    while (running.size < concurrency && pending.length > 0) {
      const record = pending.shift()
      if (!record) break
      drained = false
      let promiseResolve: () => void
      const promise = new Promise<void>((resolve) => {
        promiseResolve = resolve
      })
      running.add(promise)
      runNext(record, promise).finally(() => {
        promiseResolve!()
      })
    }
  }

  return {
    enqueue(task: TTask): Promise<TResult> {
      return new Promise((resolve, reject) => {
        pending.push({ task, resolve, reject })
        checkBackpressure()
        processQueue()
      })
    },

    drain(): Promise<void> {
      return new Promise((resolve) => {
        if (pending.length === 0 && running.size === 0) {
          resolve()
          return
        }
        const callback = () => {
          resolve()
          drainCallbacks = drainCallbacks.filter((cb) => cb !== callback)
        }
        drainCallbacks.push(callback)
      })
    },

    pause() {
      paused = true
    },

    resume() {
      paused = false
      processQueue()
    },

    onBackpressure(callback: () => void) {
      backpressureCallbacks.push(callback)
    },

    onDrain(callback: () => void) {
      drainCallbacks.push(callback)
    },

    get pendingCount() {
      return pending.length
    },

    get runningCount() {
      return running.size
    },
  }
}
