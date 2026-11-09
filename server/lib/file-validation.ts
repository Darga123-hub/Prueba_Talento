import { inflateRawSync } from "node:zlib";
import { TRPCError } from "@trpc/server";

const types = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

type Extension = keyof typeof types;
const invalid = () => new TRPCError({ code: "BAD_REQUEST", message: "El archivo no coincide con un tipo permitido o está dañado." });
const starts = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value);

function validDocx(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) return false;
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; compressed: number; size: number; local: number }>();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return false;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const end = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    if (end > buffer.length) return false;
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.set(name, { method: buffer.readUInt16LE(offset + 10), compressed: buffer.readUInt32LE(offset + 20), size: buffer.readUInt32LE(offset + 24), local: buffer.readUInt32LE(offset + 42) });
    offset = end;
  }
  if (!entries.has("_rels/.rels") || !entries.has("word/document.xml")) return false;
  const contentTypes = entries.get("[Content_Types].xml");
  if (!contentTypes || contentTypes.size > 1_000_000 || contentTypes.compressed > 1_000_000) return false;
  const local = contentTypes.local;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) return false;
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const compressed = buffer.subarray(start, start + contentTypes.compressed);
  const xml = contentTypes.method === 0 ? compressed : contentTypes.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1_000_001 }) : Buffer.alloc(0);
  return xml.toString("utf8").includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");
}

export function validateDocument(name: string, contentType: string | undefined, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 3_000_000 || name.includes("..") || /[\\/\0]/.test(name)) throw invalid();
  const extension = Object.keys(types).find((value) => name.toLowerCase().endsWith(value)) as Extension | undefined;
  if (!extension || contentType !== types[extension]) throw invalid();
  let valid = false;
  if (extension === ".pdf") {
    const tail = Buffer.from(bytes.slice(-2048)).toString("latin1");
    valid = starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) && tail.includes("%%EOF");
  } else if (extension === ".png") {
    valid = starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && Buffer.from(bytes.slice(-12)).toString("hex") === "0000000049454e44ae426082";
  } else if (extension === ".jpg" || extension === ".jpeg") {
    valid = starts(bytes, [0xff, 0xd8, 0xff]) && bytes.at(-1) === 0xd9 && bytes.at(-2) === 0xff;
  } else if (extension === ".webp") {
    valid = starts(bytes, [0x52, 0x49, 0x46, 0x46]) && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  } else if (extension === ".doc") {
    valid = starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  } else {
    try { valid = starts(bytes, [0x50, 0x4b, 0x03, 0x04]) && validDocx(bytes); } catch { valid = false; }
  }
  if (!valid) throw invalid();
  return { contentType: types[extension] };
}

export function decodeDocumentBase64(content: string) {
  if (content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw invalid();
  return Uint8Array.from(Buffer.from(content, "base64"));
}
