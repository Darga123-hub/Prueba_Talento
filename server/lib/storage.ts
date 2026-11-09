import { del, get, put } from "@vercel/blob";
import { env } from "./env.js";

export const storage = {
  async uploadFile({ fileContent, fileName, contentType }: { fileContent: Uint8Array; fileName: string; contentType?: string }) {
    const blob = await put(fileName, Buffer.from(fileContent), {
      access: "private",
      addRandomSuffix: true,
      contentType: contentType || "application/octet-stream",
      token: env.blobToken,
    });
    return { key: blob.pathname, size: fileContent.byteLength, contentType: contentType || "application/octet-stream" };
  },

  async getPresignedUrl({ key }: { key: string; download?: boolean }) {
    const blob = await get(key, { access: "private", token: env.blobToken });
    if (!blob || blob.blob.downloadUrl === undefined) throw new Error("Documento no disponible.");
    return { url: blob.blob.downloadUrl };
  },

  async deleteFile(key: string) {
    await del(key, { token: env.blobToken });
  },
};
