// Wrangler bundles `*.wasm` imports as a deploy-time CompiledWasm module
// (a `WebAssembly.Module`). This ambient declaration lets TypeScript accept
// `import wasm from '....wasm'`. NOTE: this is the ONLY allowed way to use wasm
// on Cloudflare Workers — runtime `WebAssembly.instantiate()` from fetched bytes
// is blocked ("Wasm code generation disallowed by embedder").
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

// @resvg/resvg-wasm ships the wasm at a subpath that esbuild bundles
// at deploy time as a CompiledWasm. Without an explicit declaration
// the strict tsc pass fails. Match the package's exported path exactly.
declare module '@resvg/resvg-wasm/index_bg.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
