import { buf as crc32 } from 'crc-32';
import { deflateRawSync } from 'node:zlib';

interface IZipFixtureEntry {
  name: string;
  bytes: Buffer;
  mode?: number;
  compress?: boolean;
  encrypted?: boolean;
}
export const zipFixture = (entries: IZipFixtureEntry[]): Buffer => {
  const state = { offset: 0 };
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const bytes = entry.compress ? deflateRawSync(entry.bytes) : entry.bytes;
    const flags = 0x800 | (entry.encrypted ? 1 : 0);
    const method = entry.compress ? 8 : 0;
    const crc = crc32(entry.bytes) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flags, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(bytes.length, 20);
    directory.writeUInt32LE(entry.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(((entry.mode ?? 0x8000) * 65536) >>> 0, 38);
    directory.writeUInt32LE(state.offset, 42);
    locals.push(header, name, bytes);
    central.push(directory, name);
    state.offset += header.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(state.offset, 16);
  return Buffer.concat([...locals, directory, end]);
};
