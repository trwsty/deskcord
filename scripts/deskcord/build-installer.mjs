/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { buildIcon } from "./build-icon.mjs";

export async function buildInstaller(output) {
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    await buildIcon("installer/windows/Deskcord.ico");
    const work = resolve(".preview/native-installer");
    await mkdir(work, { recursive: true });
    let legal = `Deskcord ${version}\nCódigo-fonte correspondente: Deskcord-source-${version}.zip, distribuído junto deste EXE.\n\n`;
    for (const file of ["LICENSE", "NOTICE.md", "dist/patcher.js.LEGAL.txt", "dist/renderer.js.LEGAL.txt"]) legal += `${file}\n${await readFile(file, "utf8")}\n\n`;
    const seen = new Set();
    for (const mapFile of ["patcher.js.map", "renderer.js.map"]) {
        const map = JSON.parse(await readFile(join("dist", mapFile), "utf8"));
        for (const source of map.sources.filter(path => path.includes("node_modules"))) {
            let directory = dirname(resolve("dist", source));
            while (directory.includes("node_modules")) {
                if (existsSync(join(directory, "package.json"))) {
                    if (!seen.has(directory)) {
                        seen.add(directory);
                        for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "NOTICE"]) {
                            if (existsSync(join(directory, name))) legal += `${name}\n${await readFile(join(directory, name), "utf8")}\n\n`;
                        }
                    }
                    break;
                }
                directory = dirname(directory);
            }
        }
    }
    await writeFile(join(work, "legal.txt"), legal);
    const hashes = {};
    const compilerArgs = ["/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/utf8output",
        `/out:${output}`, `/win32manifest:${resolve("installer/windows/app.manifest")}`, `/win32icon:${resolve("installer/windows/Deskcord.ico")}`];
    const framework = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319");
    for (const file of ["System.dll", "System.Core.dll", "System.Xaml.dll", "System.Web.Extensions.dll", "System.Windows.Forms.dll", "System.Drawing.dll",
        "WPF/PresentationFramework.dll", "WPF/PresentationCore.dll", "WPF/WindowsBase.dll"])
        compilerArgs.push(`/reference:${join(framework, file)}`);
    for (const name of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) {
        const bytes = await readFile(join("dist", name));
        hashes[`payload/${name}`] = createHash("sha256").update(bytes).digest("hex");
        const packed = join(work, `payload_${name}.gz`);
        await writeFile(packed, gzipSync(bytes, { level: 9 }));
        compilerArgs.push(`/resource:${packed},payload/${name}.gz`);
    }
    await writeFile(join(work, "hashes.json"), JSON.stringify(hashes));
    await writeFile(join(work, "version.txt"), version);
    compilerArgs.push(`/resource:${join(work, "hashes.json")},hashes`, `/resource:${join(work, "version.txt")},version`,
        `/resource:${join(work, "legal.txt")},legal`, `/resource:${resolve("installer/windows/Installer.xaml")},Installer.xaml`,
        resolve("installer/windows/Installer.cs"), resolve("installer/windows/NativeInstaller.cs"));
    execFileSync(join(framework, "csc.exe"), compilerArgs, { stdio: "inherit", windowsHide: true });
    console.log(output);
}

if (process.argv[1]?.endsWith("build-installer.mjs")) {
    await mkdir("release", { recursive: true });
    const { version } = JSON.parse(await readFile("package.json", "utf8"));
    await buildInstaller(resolve("release", `Deskcord-Setup-${version}.exe`));
}
