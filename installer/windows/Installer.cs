// Copyright (c) 2026 Deskcord contributors; SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Forms = System.Windows.Forms;

static class Installer {
    static Window window;
    static string cache;
    static bool busy;
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    static readonly List<string> locations = new List<string>();
    static readonly Assembly assembly = Assembly.GetExecutingAssembly();
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    static T Find<T>(string name) where T : FrameworkElement { return (T)window.FindName(name); }
    static string ReadResource(string name) { using (var r = new StreamReader(assembly.GetManifestResourceStream(name), Encoding.UTF8)) return r.ReadToEnd(); }

    [STAThread]
    static void Main(string[] args) {
        try {
            var app = new Application();
            window = (Window)XamlReader.Parse(ReadResource("Installer.xaml"));
            Find<TextBlock>("Version").Text = "v" + ReadResource("version").Trim();
            window.SourceInitialized += (s,e) => {
                try {
                    var handle = new WindowInteropHelper(window).Handle;
                    int dark = 1, captionColor = 0x001B1614, textColor = 0x00F7F4F3;
                    DwmSetWindowAttribute(handle, 20, ref dark, sizeof(int));
                    DwmSetWindowAttribute(handle, 35, ref captionColor, sizeof(int));
                    DwmSetWindowAttribute(handle, 36, ref textColor, sizeof(int));
                }
                catch (DllNotFoundException) { }
                catch (EntryPointNotFoundException) { }
            };
            if ((args.Length == 2 || args.Length == 4) && args[0] == "--render-preview") {
                Find<ComboBox>("Channels").Items.Add("Discord");
                Find<ComboBox>("Channels").SelectedIndex = 0;
                Find<TextBlock>("Status").Text = "Discord encontrado • Pronto para instalar";
                Find<TextBlock>("Location").Text = "%LOCALAPPDATA%\\Discord\\app-versão\\resources";
                var content = (FrameworkElement)window.Content;
                int width = args.Length == 4 ? int.Parse(args[2]) : (int)window.Width;
                int height = args.Length == 4 ? int.Parse(args[3]) : (int)window.Height - 32;
                if (width < 640 || width > 1600 || height < 600 || height > 1200) throw new ArgumentOutOfRangeException("preview size");
                content.Measure(new Size(width, height)); content.Arrange(new Rect(0, 0, width, height)); content.UpdateLayout();
                var image = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32); image.Render(content);
                var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image));
                using (var file = File.Create(Path.GetFullPath(args[1]))) encoder.Save(file);
                return;
            }
            Find<Button>("Licenses").Click += (s,e) => {
                var legal = new Window { Owner = window, Title = "Deskcord • Licenças e código-fonte", Width = 720, Height = 540,
                    WindowStartupLocation = WindowStartupLocation.CenterOwner, Background = window.Background };
                legal.Content = new TextBox { Text = ReadResource("legal"), IsReadOnly = true, TextWrapping = TextWrapping.Wrap,
                    VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Background = window.Background, Foreground = window.Foreground,
                    BorderThickness = new Thickness(0), Padding = new Thickness(24), FontSize = 12 };
                legal.ShowDialog();
            };
            Find<Button>("Install").Click += async (s,e) => await Run("install");
            Find<Button>("Reinstall").Click += async (s,e) => await Run("reinstall");
            Find<Button>("Uninstall").Click += async (s,e) => await Run("uninstall");
            Find<Button>("Browse").Click += async (s,e) => {
                using (var dialog = new Forms.FolderBrowserDialog()) {
                    dialog.Description = "Selecione a pasta do Discord, app-versão ou resources";
                    dialog.ShowNewFolderButton = false;
                    if (dialog.ShowDialog() == Forms.DialogResult.OK) {
                        var found = ResolveResources(dialog.SelectedPath);
                        if (found == null) { Find<TextBlock>("Status").Text = "Não encontrei app.asar nessa pasta. Escolha a instalação do Discord."; return; }
                        AddLocation(found, "Discord • pasta escolhida");
                        Find<ComboBox>("Channels").SelectedIndex = locations.Count - 1;
                    }
                }
                await Task.FromResult(0);
            };
            Find<ComboBox>("Channels").SelectionChanged += async (s,e) => { if (!busy && cache != null) await Refresh(); };
            window.Closing += (s,e) => { if (busy) e.Cancel = true; };
            window.Loaded += async (s,e) => {
                SetBusy(true);
                try {
                    cache = await Task.Run(() => Extract());
                    foreach (var channel in new [] { "Discord", "DiscordPTB", "DiscordCanary" }) {
                        var path = ResolveResources(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), channel));
                        if (path != null) AddLocation(path, channel);
                    }
                    if (locations.Count > 0) Find<ComboBox>("Channels").SelectedIndex = 0;
                } catch (Exception ex) { Find<TextBlock>("Status").Text = ex.Message; }
                finally { SetBusy(false); }
                if (cache != null) await Refresh();
            };
            app.Run(window);
        } catch (Exception ex) { MessageBox.Show(ex.Message, "Deskcord", MessageBoxButton.OK, MessageBoxImage.Error); }
        finally {
            if (cache != null && Path.GetDirectoryName(cache) == Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar)
                && Path.GetFileName(cache).StartsWith("Deskcord-Installer-", StringComparison.Ordinal)) {
                try { Directory.Delete(cache, true); } catch { }
            }
        }
    }

    static void SetBusy(bool value) {
        busy = value;
        foreach (var name in new [] { "Install", "Reinstall", "Uninstall", "Browse", "Channels", "Reopen" }) Find<Control>(name).IsEnabled = !value;
        Find<ProgressBar>("Progress").Visibility = value ? Visibility.Visible : Visibility.Collapsed;
        Find<ProgressBar>("Progress").IsIndeterminate = value;
    }
    static void AddLocation(string path, string name) { locations.Add(path); Find<ComboBox>("Channels").Items.Add(name); }
    static string ResolveResources(string path) {
        if (File.Exists(Path.Combine(path, "app.asar"))) return Path.GetFullPath(path);
        if (File.Exists(Path.Combine(path, "resources", "app.asar"))) return Path.GetFullPath(Path.Combine(path, "resources"));
        if (!Directory.Exists(path)) return null;
        return Directory.GetDirectories(path, "app-*")
            .Select(p => new { Path = p, Version = ParseVersion(Path.GetFileName(p).Substring(4)) })
            .Where(p => p.Version != null).OrderByDescending(p => p.Version)
            .Select(p => Path.Combine(p.Path, "resources")).FirstOrDefault(p => File.Exists(Path.Combine(p, "app.asar")));
    }
    static Version ParseVersion(string value) { Version result; return Version.TryParse(value, out result) ? result : null; }
    static string Selected() { var i = Find<ComboBox>("Channels").SelectedIndex; return i >= 0 && i < locations.Count ? locations[i] : null; }
    static async Task Refresh() {
        var path = Selected();
        Find<TextBlock>("Location").Text = path ?? "Nenhuma instalação encontrada. Use Procurar para escolher uma pasta.";
        if (path == null) {
            Find<TextBlock>("Status").Text = "Discord não encontrado automaticamente.";
            foreach (var name in new [] { "Install", "Reinstall", "Uninstall" }) Find<Button>(name).IsEnabled = false;
            return;
        }
        SetBusy(true);
        try {
            var result = await Worker(path, "status");
            Find<TextBlock>("Status").Text = result;
            SetBusy(false);
            var installed = result == "Deskcord instalado";
            Find<Button>("Install").Content = installed ? "Deskcord instalado" : "Instalar Deskcord";
            Find<Button>("Install").IsEnabled = !installed;
            Find<Button>("Reinstall").IsEnabled = installed;
            Find<Button>("Uninstall").IsEnabled = installed;
        } catch (Exception ex) { SetBusy(false); Find<TextBlock>("Status").Text = ex.Message; }
    }

    static string Extract() {
        var dir = Path.Combine(Path.GetTempPath(), "Deskcord-Installer-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        cache = dir;
        var hashes = json.Deserialize<Dictionary<string,string>>(ReadResource("hashes"));
        foreach (var pair in hashes) {
            var path = Path.GetFullPath(Path.Combine(dir, pair.Key));
            if (!path.StartsWith(dir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Recurso inválido.");
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            using (var input = assembly.GetManifestResourceStream(pair.Key + ".gz"))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var output = new FileStream(path, FileMode.CreateNew)) gzip.CopyTo(output);
            using (var sha = SHA256.Create())
            using (var file = File.OpenRead(path)) {
                var hash = BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
                if (hash != pair.Value) throw new IOException("Falha na integridade do instalador. Baixe uma nova cópia.");
            }
        }
        return dir;
    }
    static async Task<string> Worker(string resources, string action) {
        return await Task.Run(() => {
            var info = new ProcessStartInfo(Path.Combine(cache, "node.exe"), "\"" + Path.Combine(cache, "worker.cjs") + "\" --request") {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8, WorkingDirectory = cache
            };
            using (var process = Process.Start(info)) {
                var stdout = process.StandardOutput.ReadToEndAsync();
                var stderr = process.StandardError.ReadToEndAsync();
                process.StandardInput.WriteLine(json.Serialize(new { resources = resources, action = action }));
                process.StandardInput.Close();
                if (!process.WaitForExit(90000)) { process.Kill(); throw new IOException("O instalador excedeu o tempo limite. Verifique os arquivos antes de tentar novamente."); }
                var output = stdout.GetAwaiter().GetResult().Trim();
                stderr.GetAwaiter().GetResult();
                if (process.ExitCode != 0 && output.Length == 0)
                    throw new IOException("O processo do instalador falhou (código " + process.ExitCode + "). Baixe uma nova cópia do EXE.");
                var result = json.Deserialize<Dictionary<string,object>>(output);
                if (result == null || !(bool)result["ok"]) throw new IOException(result == null ? "Falha no instalador." : (string)result["message"]);
                return (string)result["message"];
            }
        });
    }
    static string DiscordExe(string resources) {
        var dir = Path.GetDirectoryName(resources);
        return new [] { "Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe" }.Select(n => Path.Combine(dir,n)).FirstOrDefault(File.Exists);
    }
    static void CloseDiscord(string exe) {
        var root = Path.GetDirectoryName(Path.GetDirectoryName(exe)) + Path.DirectorySeparatorChar;
        var matches = new List<Process>();
        foreach (var name in new [] { "Discord", "DiscordPTB", "DiscordCanary" }) {
            foreach (var process in Process.GetProcessesByName(name)) {
                try {
                    var path = process.MainModule.FileName;
                    if (path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) matches.Add(process); else process.Dispose();
                } catch { process.Dispose(); }
            }
        }
        foreach (var process in matches) { try { process.CloseMainWindow(); } catch (InvalidOperationException) { } }
        foreach (var process in matches) {
            try { if (!process.WaitForExit(1500)) { process.Kill(); if (!process.WaitForExit(5000)) throw new IOException("Não foi possível fechar o Discord."); } }
            catch (InvalidOperationException) { }
            finally { process.Dispose(); }
        }
    }
    static async Task Run(string action) {
        var path = Selected(); if (path == null || busy || cache == null) return;
        var exe = DiscordExe(path);
        if (exe == null) { Find<TextBlock>("Status").Text = "Executável do Discord não encontrado nessa pasta."; return; }
        var reopen = Find<CheckBox>("Reopen").IsChecked == true;
        bool failed = false;
        SetBusy(true);
        try {
            // Validate ownership before closing the user's running Discord.
            await Worker(path, "status");
            Find<TextBlock>("Status").Text = "Fechando o Discord e preparando os arquivos…";
            await Task.Run(() => CloseDiscord(exe));
            Find<TextBox>("Log").Text = await Worker(path, action);
            Find<TextBlock>("Status").Text = "Concluído.";
            if (reopen) Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = Path.GetDirectoryName(exe), UseShellExecute = true });
        } catch (Exception ex) {
            failed = true;
            Find<TextBox>("Log").Text = ex.Message;
            Find<TextBlock>("Status").Text = "Não foi possível concluir. Consulte o detalhe abaixo.";
        } finally { SetBusy(false); }
        await Refresh();
        if (failed) Find<TextBlock>("Status").Text = "Não foi possível concluir. Consulte o detalhe abaixo.";
    }
}
