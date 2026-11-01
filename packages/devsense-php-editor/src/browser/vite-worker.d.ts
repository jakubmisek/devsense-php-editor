// Vite `?worker` imports: the default export is a Worker constructor.
declare module '*?worker' {
  const WorkerConstructor: { new (options?: { name?: string }): Worker };
  export default WorkerConstructor;
}
