/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { createPackage, extractFile } from "@electron/asar";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const framework = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319");
const work = resolve(".preview/native-installer");
await mkdir(work, { recursive: true });
const executable = join(work, "smoke.exe");
const refs = ["System.dll", "System.Core.dll", "System.Xaml.dll", "WPF/PresentationFramework.dll", "WPF/PresentationCore.dll", "WPF/WindowsBase.dll"];
execFileSync(join(framework, "csc.exe"), ["/nologo", "/target:exe", "/platform:x64", `/out:${executable}`,
    ...refs.map(name => `/reference:${join(framework, name)}`), resolve("tests/windows/InstallerSmoke.cs")], { stdio: "inherit", windowsHide: true });
const fixture = await mkdtemp(join(tmpdir(), "deskcord-native-test-"));
try {
    const app = join(fixture, "Discord", "app-1.0.0");
    const resources = join(app, "resources");
    const original = join(fixture, "original");
    await mkdir(resources, { recursive: true });
    await mkdir(original);
    await writeFile(join(app, "Discord.exe"), "fixture only; must never execute");
    await writeFile(join(original, "package.json"), '{"name":"discord-fixture","main":"index.js"}');
    await writeFile(join(original, "index.js"), "// fixture");
    await createPackage(original, join(resources, "app.asar"));
    const before = await readFile(join(resources, "app.asar"));
    for (const name of ["unknown", "malformed", "linked", "interrupted", "locked", "migrate"]) {
        const directory = join(fixture, "cases", name);
        await mkdir(directory, { recursive: true });
        await copyFile(join(resources, "app.asar"), join(directory, "app.asar"));
    }
    await writeFile(join(fixture, "cases/unknown/_app.asar"), before);
    await writeFile(join(fixture, "cases/malformed/app.asar"), Buffer.from([4, 0, 0, 0, 255, 255, 255, 255]));
    await writeFile(join(fixture, "cases/interrupted/deskcord-staged.asar"), "preserve interrupted operation");
    const outside = join(fixture, "outside"); await mkdir(outside);
    await writeFile(join(outside, "sentinel.txt"), "preserve personal file");
    await symlink(outside, join(fixture, "cases/linked/Deskcord"), "junction");
    const vencord = join(fixture, "vencord"); await mkdir(vencord);
    await writeFile(join(vencord, "package.json"), '{"name":"discord","main":"index.js"}');
    await writeFile(join(vencord, "index.js"), 'require("C:\\\\Users\\\\Test\\\\AppData\\\\Roaming\\\\Vencord\\\\dist\\\\patcher.js")');
    await writeFile(join(fixture, "cases/migrate/_app.asar"), before);
    await rm(join(fixture, "cases/migrate/app.asar"));
    await createPackage(vencord, join(fixture, "cases/migrate/app.asar"));
    execFileSync(executable, [resolve("release", `Deskcord-Setup-${version}.exe`), resources], { stdio: "inherit", windowsHide: true, timeout: 120000 });
    assert.deepEqual(await readFile(join(resources, "app.asar")), before);
    const injector = join(app, "fixture-loader.asar");
    assert.equal(JSON.parse(extractFile(injector, "deskcord-install.json").toString()).product, "Deskcord");
    assert.match(extractFile(injector, "index.js").toString(), /Deskcord\/[a-f0-9]{64}/);
    assert.equal(JSON.parse(extractFile(injector, "package.json").toString()).main, "index.js");
    assert.equal(await readFile(join(outside, "sentinel.txt"), "utf8"), "preserve personal file");
} finally {
    if (dirname(await realpath(fixture)) === await realpath(tmpdir())) await rm(fixture, { recursive: true, force: true });
}
