/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Deskcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const prefix = Buffer.alloc(4), suffix = Buffer.alloc(4);
    prefix.writeUInt32BE(data.length); suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([prefix, body, suffix]);
}

// ICO bitmaps, supersampled from the same simple D mark used by the WPF UI.
export async function buildIcon(path) {
    const sizes = [16, 32, 48, 64, 256];
    const images = sizes.map(size => {
        const maskStride = Math.ceil(size / 32) * 4;
        const bytes = Buffer.alloc(40 + size * size * 4 + maskStride * size);
        bytes.writeUInt32LE(40, 0); bytes.writeInt32LE(size, 4); bytes.writeInt32LE(size * 2, 8);
        bytes.writeUInt16LE(1, 12); bytes.writeUInt16LE(32, 14);
        function sample(x, y) {
            const dx = Math.max(Math.abs(x - 0.5) - 0.28, 0);
            const dy = Math.max(Math.abs(y - 0.5) - 0.28, 0);
            if (dx * dx + dy * dy > 0.2 * 0.2) return [0, 0, 0, 0];
            const outer = x >= 0.29 && (x <= 0.48 || ((x - 0.48) / 0.25) ** 2 + ((y - 0.5) / 0.27) ** 2 <= 1) && y >= 0.23 && y <= 0.77;
            const inner = x >= 0.38 && (x <= 0.48 || ((x - 0.48) / 0.16) ** 2 + ((y - 0.5) / 0.18) ** 2 <= 1) && y >= 0.32 && y <= 0.68;
            return outer && !inner ? [255, 255, 255, 255] : [245, 118, 101, 255];
        }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const color = [0, 0, 0, 0];
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
                const pixel = sample((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
                for (let c = 0; c < 4; c++) color[c] += pixel[c] / 16;
            }
            const offset = 40 + ((size - y - 1) * size + x) * 4;
            for (let c = 0; c < 4; c++) bytes[offset + c] = Math.round(color[c]);
        }
        if (size !== 256) return bytes;
        const rows = Buffer.alloc(size * (1 + size * 4));
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const source = 40 + ((size - y - 1) * size + x) * 4;
            const target = y * (1 + size * 4) + 1 + x * 4;
            rows[target] = bytes[source + 2]; rows[target + 1] = bytes[source + 1];
            rows[target + 2] = bytes[source]; rows[target + 3] = bytes[source + 3];
        }
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
    });
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    images.forEach((bytes, index) => {
        const entry = 6 + index * 16;
        header[entry] = header[entry + 1] = sizes[index] % 256;
        header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(bytes.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
        offset += bytes.length;
    });
    await writeFile(path, Buffer.concat([header, ...images]));
}
