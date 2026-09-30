import test from "node:test";
import assert from "node:assert/strict";
import { makeZip, crc32, utf8 } from "../scripts/lib/zip.mjs";

test("ZIP stores Unicode source with correct headers and a central directory", () => {
  const zip = makeZip({ "目录/说明.md": "评估 🧪", "a.txt": "abc" });
  const view = new DataView(zip.buffer), end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  let offset = 0;
  const decoded = {};
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 6, true), 0x0800);
    assert.equal(view.getUint16(offset + 8, true), 0);
    const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true);
    const name = new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + nameSize));
    const data = zip.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size);
    assert.equal(view.getUint32(offset + 14, true), crc32(data));
    decoded[name] = new TextDecoder().decode(data);
    offset += 30 + nameSize + size;
  }
  assert.deepEqual(decoded, { "a.txt": "abc", "目录/说明.md": "评估 🧪" });
  assert.equal(offset, view.getUint32(end + 16, true));
  assert.equal(view.getUint32(offset, true), 0x02014b50);
});
test("ZIP is reproducible and blocks parent paths", () => {
  assert.deepEqual(makeZip({ a: "a", b: "b" }), makeZip({ b: "b", a: "a" }));
  assert.throws(() => makeZip({ "../secret": "x" }), /Unsafe/);
  assert.equal(crc32(utf8("123456789")), 0xcbf43926);
});
