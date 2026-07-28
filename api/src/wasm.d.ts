// Ambient declarations for the WASM modules bundled by esbuild at
// deploy time. Mirrors worker/wasm.d.ts so the API tsc pass (which
// doesn't include worker/) can resolve the same paths.
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

declare module '@resvg/resvg-wasm/index_bg.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
