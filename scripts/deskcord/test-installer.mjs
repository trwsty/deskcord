/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { createPackage } from "@electron/asar";

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
    execFileSync(executable, [resolve("release", `Deskcord-Setup-${version}.exe`), resources], { stdio: "inherit", windowsHide: true, timeout: 120000 });
    assert.deepEqual(await readFile(join(resources, "app.asar")), before);
} finally {
    if (dirname(await realpath(fixture)) === await realpath(tmpdir())) await rm(fixture, { recursive: true, force: true });
}
