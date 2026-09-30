// Deterministic uncompressed ZIP writer; shared by CLI packaging and the download page.
export function utf8(text) {
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(bytes);
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function makeZip(files, prefix = "") {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length > 65535) throw new Error("ZIP64 is not supported.");
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [relative, content] of entries) {
    const filename = prefix + relative;
    if (!filename || filename.startsWith("/") || filename.split("/").some(part => part === "..") || filename.includes("\\")) throw new Error("Unsafe ZIP path.");
    const name = utf8(filename), data = utf8(content), checksum = crc32(data);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(12, date, true); h.setUint32(14, checksum, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    header.set(name, 30); local.push(header, data);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, (3 << 8) | 20, true);
    d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true); d.setUint16(14, date, true);
    d.setUint32(16, checksum, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true); d.setUint32(38, 0x81a40000, true); d.setUint32(42, offset, true);
    directory.set(name, 46); central.push(directory);
    offset += header.length + data.length; centralSize += directory.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + 22);
  let position = 0;
  for (const chunk of [...local, ...central, end]) { result.set(chunk, position); position += chunk.length; }
  return result;
}
