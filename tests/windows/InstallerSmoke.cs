// Copyright (c) 2026 Deskcord contributors; SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Threading;

static class InstallerSmoke {
    static Type installer;
    const BindingFlags Private = BindingFlags.Static | BindingFlags.NonPublic;
    static object Call(string name, params object[] args) { return installer.GetMethod(name, Private).Invoke(null, args); }
    static void Assert(bool value, string message) { if (!value) throw new Exception(message); }

    [STAThread]
    static int Main(string[] args) {
        var app = new Application();
        var assembly = Assembly.LoadFrom(Path.GetFullPath(args[0]));
        installer = assembly.GetType("Installer", true);
        Window window;
        using (var resource = assembly.GetManifestResourceStream("Installer.xaml"))
        using (var reader = new StreamReader(resource)) window = (Window)XamlReader.Parse(reader.ReadToEnd());
        installer.GetField("window", Private).SetValue(null, window);
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(app.Dispatcher));
        int result = 1;
        app.Dispatcher.BeginInvoke(new Action(async () => {
            string cache = null;
            try {
                cache = (string)Call("Extract");
                installer.GetField("cache", Private).SetValue(null, cache);
                var resources = Path.GetFullPath(args[1]);
                // This path belongs to a disposable fixture, never a discovered user installation.
                Assert(resources.StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)
                    && resources.Contains("deskcord-native-test-"), "Unsafe fixture path");
                ((List<string>)installer.GetField("locations", Private).GetValue(null)).Add(resources);
                var channels = (ComboBox)window.FindName("Channels");
                channels.Items.Add("Discord fixture"); channels.SelectedIndex = 0;
                ((CheckBox)window.FindName("Reopen")).IsChecked = false;
                var log = (TextBox)window.FindName("Log");
                var status = (TextBlock)window.FindName("Status");
                await (Task)Call("Run", "install");
                Assert(log.Text.Contains("Deskcord instalado"), "Install result: " + log.Text);
                Assert(File.Exists(Path.Combine(resources, "_app.asar")), "Original backup missing");
                await (Task)Call("Run", "reinstall");
                Assert(log.Text.Contains("Deskcord instalado"), "Reinstall result: " + log.Text);
                File.Move(Path.Combine(resources, "_app.asar"), Path.Combine(resources, "fixture-original.asar"));
                await (Task)Call("Run", "uninstall");
                Assert(log.Text.Contains("Backup original ausente"), "Failure result: " + log.Text);
                Assert(File.Exists(Path.Combine(resources, "app.asar")), "Failed uninstall altered loader");
                File.Move(Path.Combine(resources, "fixture-original.asar"), Path.Combine(resources, "_app.asar"));
                await (Task)Call("Run", "uninstall");
                Assert(log.Text.Contains("Discord original restaurado"), "Uninstall result: " + log.Text);
                Assert(!File.Exists(Path.Combine(resources, "_app.asar")), "Backup not restored");
                await (Task)Call("Refresh");
                Assert(status.Text == "Discord sem Deskcord", "Unexpected final status: " + status.Text);
                Console.WriteLine("Native WPF handlers: install, reinstall, failure message and uninstall OK");
                result = 0;
            } catch (Exception ex) { Console.Error.WriteLine(ex); }
            finally {
                if (cache != null && Path.GetDirectoryName(cache) == Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar)
                    && Path.GetFileName(cache).StartsWith("Deskcord-Installer-", StringComparison.Ordinal)) Directory.Delete(cache, true);
                app.Shutdown();
            }
        }));
        app.Run();
        return result;
    }
}
