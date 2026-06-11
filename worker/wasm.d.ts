// Wrangler bundles `*.wasm` imports as a deploy-time CompiledWasm module
// (a `WebAssembly.Module`). This ambient declaration lets TypeScript accept
// `import wasm from '....wasm'`. NOTE: this is the ONLY allowed way to use wasm
// on Cloudflare Workers — runtime `WebAssembly.instantiate()` from fetched bytes
// is blocked ("Wasm code generation disallowed by embedder").
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
