// Copyright (c) 2026 Deskcord contributors; SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

// Reads bounded root entries and writes only our three-file injector; never executes archive contents.
static class NativeInstaller {
    static readonly string[] Payload = { "patcher.js", "preload.js", "renderer.js", "renderer.css" };
    const string Owner = "{\"product\":\"Deskcord\",\"format\":1}";
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024, RecursionLimit = 64 }; }
    static Dictionary<string,object> Object(object value) {
        var result = value as Dictionary<string,object>;
        if (result == null) throw new IOException("Formato ASAR inválido.");
        return result;
    }
    static void Plain(string input) {
        for (var path = Path.GetFullPath(input); path != null; path = Path.GetDirectoryName(path)) {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Links de arquivos ou pastas não são aceitos.");
        }
    }
    static void Regular(string path) {
        Plain(path);
        if ((File.GetAttributes(path) & FileAttributes.Directory) != 0) throw new IOException("Era esperado um arquivo regular.");
    }
    static byte[] ReadExactly(BinaryReader reader, int count) {
        var bytes = reader.ReadBytes(count);
        if (bytes.Length != count) throw new IOException("Arquivo ASAR incompleto.");
        return bytes;
    }
    static Dictionary<string,object> Header(BinaryReader reader, out long dataOffset) {
        if (reader.ReadUInt32() != 4) throw new IOException("Cabeçalho ASAR inválido.");
        uint size = reader.ReadUInt32();
        if (size < 8 || size > 16 * 1024 * 1024 || 8L + size > reader.BaseStream.Length) throw new IOException("Tamanho de cabeçalho ASAR inválido.");
        uint payloadSize = reader.ReadUInt32(), textSize = reader.ReadUInt32();
        if (payloadSize != size - 4 || textSize > size - 8) throw new IOException("Cabeçalho ASAR inválido.");
        dataOffset = 8L + size;
        var root = Object(Json().DeserializeObject(new UTF8Encoding(false, true).GetString(ReadExactly(reader, (int)textSize))));
        return Object(root["files"]);
    }
    static string Entry(string file, string name) {
        Regular(file);
        using (var stream = File.OpenRead(file)) using (var reader = new BinaryReader(stream)) {
            long start;
            var files = Header(reader, out start);
            var entry = Object(files[name]);
            if (entry.ContainsKey("link") || entry.ContainsKey("unpacked") || entry.ContainsKey("files")) throw new IOException("Entrada ASAR não suportada.");
            long size = Convert.ToInt64(entry["size"], CultureInfo.InvariantCulture), offset;
            if (!(entry["offset"] is string) || !long.TryParse((string)entry["offset"], NumberStyles.None, CultureInfo.InvariantCulture, out offset)
                || size < 0 || size > 1024 * 1024 || offset < 0 || start > stream.Length || offset > stream.Length - start
                || size > stream.Length - start - offset) throw new IOException("Limites de entrada ASAR inválidos.");
            stream.Position = start + offset;
            return new UTF8Encoding(false, true).GetString(ReadExactly(reader, (int)size));
        }
    }
    static bool Owned(string file) {
        try { var marker = Object(Json().DeserializeObject(Entry(file, "deskcord-install.json"))); return (string)marker["product"] == "Deskcord" && Convert.ToInt32(marker["format"]) == 1; }
        catch { return false; }
    }
    static bool Vencord(string file) {
        try {
            if (new FileInfo(file).Length > 2 * 1024 * 1024) return false;
            using (var stream = File.OpenRead(file)) using (var reader = new BinaryReader(stream)) {
                long start; var files = Header(reader, out start);
                if (files.Count != 2 || !files.ContainsKey("index.js") || !files.ContainsKey("package.json")) return false;
            }
            var loader = Entry(file, "index.js").Trim();
            var match = Regex.Match(loader, "^require\\((\"(?:[^\"\\\\]|\\\\.)*\")\\);?$");
            if (!match.Success) return false;
            var target = Json().Deserialize<string>(match.Groups[1].Value);
            return Regex.IsMatch(target, @"^[A-Za-z]:\\[^\r\n]*\\Vencord\\dist\\patcher\.js$", RegexOptions.IgnoreCase);
        } catch { return false; }
    }
    static void Original(string file) {
        var package = Object(Json().DeserializeObject(Entry(file, "package.json")));
        if (!package.ContainsKey("main") || !(package["main"] is string) || String.IsNullOrWhiteSpace((string)package["main"]))
            throw new IOException("O backup original do Discord não é válido.");
    }
    static void WriteArchive(string target, string slot) {
        var entries = new Dictionary<string,byte[]> {
            { "package.json", Encoding.UTF8.GetBytes("{\"name\":\"deskcord-injector\",\"main\":\"index.js\"}") },
            { "index.js", Encoding.UTF8.GetBytes("require(require(\"path\").join(__dirname, \"..\", " + Json().Serialize("Deskcord/" + slot) + ", \"patcher.js\"));\n") },
            { "deskcord-install.json", Encoding.UTF8.GetBytes(Owner) }
        };
        var files = new Dictionary<string,object>();
        int offset = 0;
        foreach (var entry in entries) { files.Add(entry.Key, new { size = entry.Value.Length, offset = offset.ToString(CultureInfo.InvariantCulture) }); offset += entry.Value.Length; }
        var json = Encoding.UTF8.GetBytes(Json().Serialize(new { files = files }));
        int padded = (json.Length + 3) & ~3;
        using (var stream = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None)) using (var writer = new BinaryWriter(stream)) {
            writer.Write(4u); writer.Write((uint)(8 + padded)); writer.Write((uint)(4 + padded)); writer.Write((uint)json.Length);
            writer.Write(json); writer.Write(new byte[padded - json.Length]);
            foreach (var entry in entries) writer.Write(entry.Value);
            writer.Flush(); stream.Flush(true);
        }
    }
    static string Hash(IEnumerable<byte[]> items) {
        using (var sha = SHA256.Create()) {
            foreach (var bytes in items) sha.TransformBlock(bytes, 0, bytes.Length, bytes, 0);
            sha.TransformFinalBlock(new byte[0], 0, 0);
            return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
        }
    }
    static bool OwnedFolder(string folder) {
        Plain(folder);
        var marker = Path.Combine(folder, "owner.json");
        if (!File.Exists(marker)) return false;
        Regular(marker);
        return new FileInfo(marker).Length <= 256 && File.ReadAllText(marker) == Owner;
    }
    static bool PlainSlot(string slot) {
        Plain(slot);
        if (Directory.GetDirectories(slot).Length != 0) return false;
        foreach (var file in Directory.GetFiles(slot)) {
            Regular(file);
            if (!Payload.Contains(Path.GetFileName(file))) return false;
        }
        return true;
    }
    static void RemoveRuntime(string resources) {
        var folder = Path.Combine(resources, "Deskcord");
        if (!Directory.Exists(folder) || !OwnedFolder(folder)) return;
        if (Directory.GetFiles(folder).Any(file => Path.GetFileName(file) != "owner.json")) return;
        foreach (var slot in Directory.GetDirectories(folder)) {
            if (!Regex.IsMatch(Path.GetFileName(slot), "^[a-f0-9]{64}$") || !PlainSlot(slot)) return;
        }
        if (Path.GetDirectoryName(Path.GetFullPath(folder)) == resources) Directory.Delete(folder, true);
    }
    static void PruneRuntime(string folder, string current, string previous) {
        if (!OwnedFolder(folder) || Directory.GetFiles(folder).Any(file => Path.GetFileName(file) != "owner.json")) return;
        foreach (var slot in Directory.GetDirectories(folder)) {
            var name = Path.GetFileName(slot);
            if (name == current || name == previous || !Regex.IsMatch(name,"^[a-f0-9]{64}$")) continue;
            if (PlainSlot(slot) && Path.GetDirectoryName(Path.GetFullPath(slot)) == folder) Directory.Delete(slot,true);
        }
    }
    public static string Execute(string input, string action, string payload) {
        var resources = Path.GetFullPath(input).TrimEnd(Path.DirectorySeparatorChar);
        Plain(resources);
        if (!Directory.Exists(resources)) throw new IOException("Pasta resources inválida.");
        var target = Path.Combine(resources, "app.asar");
        var backup = Path.Combine(resources, "_app.asar");
        Regular(target);
        if (File.Exists(backup)) Regular(backup);
        bool owned = Owned(target), migrating = !owned && Vencord(target) && File.Exists(backup);
        if (action == "status") return owned ? "Deskcord instalado" : migrating ? "Vencord instalado — será substituído com backup" : "Discord sem Deskcord";
        if (action == "uninstall") {
            if (!owned) throw new IOException("Esta instalação não pertence ao Deskcord; nenhum arquivo foi alterado.");
            if (!File.Exists(backup)) throw new IOException("Backup original ausente; nenhum arquivo foi alterado.");
            Original(backup);
            var previous = Path.Combine(resources, "deskcord-uninstall.asar");
            if (File.Exists(previous) || Directory.Exists(previous)) throw new IOException("Uma desinstalação anterior foi interrompida.");
            File.Replace(backup,target,previous);
            File.Delete(previous);
            try { RemoveRuntime(resources); } catch { return "Discord original restaurado. Alguns arquivos residuais precisam de verificação manual."; }
            return "Deskcord desinstalado. Discord original restaurado; temas e configurações preservados.";
        }
        if (action != "install" && action != "reinstall") throw new IOException("Ação inválida.");
        if (File.Exists(backup) && !owned && !migrating) throw new IOException("Outro mod ou backup já existe; nenhum arquivo foi alterado.");
        if (owned && !File.Exists(backup)) throw new IOException("Backup original ausente; repare a instalação do Discord.");
        Original(owned || migrating ? backup : target);
        var previousId = owned ? Regex.Match(Entry(target,"index.js"), @"Deskcord/([a-f0-9]{64})").Groups[1].Value : "";
        var data = Payload.Select(name => { var file = Path.Combine(payload, name); Regular(file); if (new FileInfo(file).Length > 8 * 1024 * 1024) throw new IOException("Payload maior que o limite autorizado."); return File.ReadAllBytes(file); }).ToArray();
        string id = Hash(data);
        var folder = Path.Combine(resources, "Deskcord");
        if (Directory.Exists(folder)) { if (!OwnedFolder(folder)) throw new IOException("A pasta Deskcord existente não pertence a este instalador."); }
        else { Directory.CreateDirectory(folder); File.WriteAllText(Path.Combine(folder, "owner.json"), Owner, new UTF8Encoding(false)); }
        var slot = Path.Combine(folder, id);
        if (Directory.Exists(slot)) {
            if (!PlainSlot(slot)) throw new IOException("Pasta de runtime contém arquivos desconhecidos.");
            bool same = Payload.Select((name,index) => File.Exists(Path.Combine(slot,name)) && new FileInfo(Path.Combine(slot,name)).Length == data[index].Length && File.ReadAllBytes(Path.Combine(slot,name)).SequenceEqual(data[index])).All(value => value);
            if (!same) { id = Hash(new [] { Encoding.UTF8.GetBytes(id + Guid.NewGuid().ToString("N")) }); slot = Path.Combine(folder,id); }
        }
        if (!Directory.Exists(slot)) {
            Directory.CreateDirectory(slot);
            for (int i = 0; i < Payload.Length; i++) using (var file = new FileStream(Path.Combine(slot,Payload[i]),FileMode.CreateNew)) file.Write(data[i],0,data[i].Length);
        }
        var staged = Path.Combine(resources,"deskcord-staged.asar");
        var old = Path.Combine(resources,"deskcord-previous.asar");
        if (File.Exists(staged) || Directory.Exists(staged) || File.Exists(old) || Directory.Exists(old)) throw new IOException("Instalação anterior interrompida. Verifique deskcord-*.asar.");
        try {
            WriteArchive(staged,id);
            if (migrating) {
                var saved = Path.Combine(resources,"deskcord-vencord-backup.asar");
                if (File.Exists(saved)) { Regular(saved); if (new FileInfo(saved).Length != new FileInfo(target).Length || !File.ReadAllBytes(saved).SequenceEqual(File.ReadAllBytes(target))) throw new IOException("Backup de migração diferente já existe."); }
                else File.Copy(target,saved,false);
            }
            // Windows replaces the loader and creates its backup in one filesystem operation.
            File.Replace(staged,target,owned || migrating ? old : backup);
        } finally { if (File.Exists(staged)) File.Delete(staged); }
        if (File.Exists(old)) File.Delete(old);
        try { PruneRuntime(folder,id,previousId); } catch { /* Keep unrecognized or locked files rather than failing a completed installation. */ }
        return "Deskcord instalado. Abra as configurações do Discord e procure Deskcord, Plugins e Temas.";
    }
}
