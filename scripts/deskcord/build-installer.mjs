/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Copyright (c) 2026 Deskcord contributors; SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

import { buildIcon } from "./build-icon.mjs";

export async function buildInstaller(output) {
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    await buildIcon("installer/windows/Deskcord.ico");
    const work = resolve(".preview/native-installer");
    await mkdir(work, { recursive: true });
    const lockPath = "installer/windows/node-runtime.json";
    let lock;
    if (existsSync(lockPath)) lock = JSON.parse(await readFile(lockPath, "utf8"));
    else {
        const version = "v24.22.3";
        const url = `https://nodejs.org/dist/${version}/win-x64/node.exe`;
        const sums = await (await fetch(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)).text();
        const hash = sums.split("\n").find(line => line.endsWith(" win-x64/node.exe"))?.split(/\s+/)[0];
        if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Checksum oficial do Node não encontrado.");
        lock = { version, url, sha256: hash };
        await writeFile(lockPath, JSON.stringify(lock, null, 4) + "\n");
    }
    const runtime = join(work, "node.exe");
    if (!existsSync(runtime)) {
        const response = await fetch(lock.url);
        if (!response.ok) throw new Error("Não foi possível baixar o runtime oficial.");
        await writeFile(runtime, Buffer.from(await response.arrayBuffer()));
    }
    const node = await readFile(runtime);
    if (createHash("sha256").update(node).digest("hex") !== lock.sha256) throw new Error("SHA-256 do runtime Node incorreto.");
    const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/${lock.version}/LICENSE`);
    if (!license.ok) throw new Error("Licença do Node não encontrada.");
    await writeFile(join(work, "Node-LICENSE.txt"), await license.text());
    const worker = join(work, "worker.cjs");
    const result = await build({ entryPoints: ["scripts/deskcord/native-worker.mjs"], outfile: worker,
        bundle: true, platform: "node", format: "cjs", target: "node24", metafile: true,
        define: { "import.meta.url": "__deskcord_import_meta_url" },
        banner: { js: 'const __deskcord_import_meta_url = require("node:url").pathToFileURL(__filename).href;' } });
    let legal = `Deskcord ${version}\nCódigo-fonte correspondente: Deskcord-source-${version}.zip, distribuído junto deste EXE.\n\n`;
    for (const file of ["LICENSE", "NOTICE.md", join(work, "Node-LICENSE.txt")]) legal += `${file}\n${await readFile(file, "utf8")}\n\n`;
    const seen = new Set();
    for (const source of Object.keys(result.metafile.inputs).filter(path => path.includes("node_modules"))) {
        let directory = dirname(resolve(source));
        while (directory.includes("node_modules")) {
            if (existsSync(join(directory, "package.json"))) {
                if (!seen.has(directory)) {
                    seen.add(directory);
                    for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "NOTICE"]) {
                        if (existsSync(join(directory, name))) legal += `${directory.split("node_modules").at(-1)}\n${await readFile(join(directory, name), "utf8")}\n\n`;
                    }
                }
                break;
            }
            directory = dirname(directory);
        }
    }
    await writeFile(join(work, "legal.txt"), legal);
    const resources = new Map([["node.exe", runtime], ["worker.cjs", worker]]);
    for (const file of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) resources.set(`payload/${file}`, resolve("dist", file));
    const hashes = {};
    const compilerArgs = ["/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/utf8output",
        `/out:${output}`, `/win32manifest:${resolve("installer/windows/app.manifest")}`, `/win32icon:${resolve("installer/windows/Deskcord.ico")}`];
    const framework = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319");
    for (const file of ["System.dll", "System.Core.dll", "System.Xaml.dll", "System.Web.Extensions.dll", "System.Windows.Forms.dll", "System.Drawing.dll",
        "WPF/PresentationFramework.dll", "WPF/PresentationCore.dll", "WPF/WindowsBase.dll"])
        compilerArgs.push(`/reference:${join(framework, file)}`);
    for (const [name, source] of resources) {
        const bytes = await readFile(source);
        hashes[name] = createHash("sha256").update(bytes).digest("hex");
        const packed = join(work, name.replaceAll("/", "_") + ".gz");
        await writeFile(packed, gzipSync(bytes, { level: 9 }));
        compilerArgs.push(`/resource:${packed},${name}.gz`);
    }
    await writeFile(join(work, "hashes.json"), JSON.stringify(hashes));
    await writeFile(join(work, "version.txt"), version);
    compilerArgs.push(`/resource:${join(work, "hashes.json")},hashes`, `/resource:${join(work, "version.txt")},version`,
        `/resource:${join(work, "legal.txt")},legal`,
        `/resource:${resolve("installer/windows/Installer.xaml")},Installer.xaml`, resolve("installer/windows/Installer.cs"));
    execFileSync(join(framework, "csc.exe"), compilerArgs, { stdio: "inherit", windowsHide: true });
    await copyFile(join(work, "Node-LICENSE.txt"), join(resolve(output, ".."), "Node-LICENSE.txt"));
    console.log(output);
    return result.metafile;
}

if (process.argv[1]?.endsWith("build-installer.mjs")) {
    await mkdir("release", { recursive: true });
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    await buildInstaller(resolve("release", `Deskcord-Setup-${version}.exe`));
}
