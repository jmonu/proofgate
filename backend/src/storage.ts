import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "./config.js";
import { encrypt, decrypt } from "./security.js";
export interface PrivateDocumentStore {
  put(storageId: string, ownerId: string, data: Buffer): Promise<void>;
  get(storageId: string, ownerId: string): Promise<Buffer>;
  remove(storageId: string): Promise<void>;
}
// Implement this interface with a private object-store client to move storage.
// Callers must still perform database ownership checks before invoking it.
class EncryptedLocalStore implements PrivateDocumentStore {
  private path(id: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id))
      throw new Error("Invalid internal storage identifier.");
    return resolve(config.storage, id);
  }
  async put(id: string, owner: string, data: Buffer) {
    await mkdir(config.storage, { recursive: true });
    await writeFile(this.path(id), encrypt(data, owner + ":" + id), {
      flag: "wx",
      mode: 0o600,
    });
  }
  async get(id: string, owner: string) {
    return decrypt(await readFile(this.path(id)), owner + ":" + id);
  }
  async remove(id: string) {
    await unlink(this.path(id));
  }
}
export const documentStore: PrivateDocumentStore = new EncryptedLocalStore();
