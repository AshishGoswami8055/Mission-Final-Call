import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const escapeForPowerShell = (value) => String(value || "").replace(/'/g, "''");

/**
 * Open the OS file picker on the machine running the API (localhost study setup).
 * Returns absolute path, or null if the user cancelled.
 */
export const pickVideoFilePath = async ({ title = "Select full course video" } = {}) => {
  const safeTitle = escapeForPowerShell(title);

  if (process.platform === "win32") {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Video files (*.mp4;*.mkv;*.webm;*.mov;*.m4v)|*.mp4;*.mkv;*.webm;*.mov;*.m4v|All files (*.*)|*.*"
$dialog.Title = '${safeTitle}'
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.FileName
}
`.trim();

    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: false, maxBuffer: 4 * 1024 * 1024 }
    );
    const picked = String(stdout || "").trim();
    return picked || null;
  }

  if (process.platform === "darwin") {
    const escapedTitle = String(title || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      `POSIX path of (choose file with prompt "${escapedTitle}" of type {"mp4", "mov", "mkv", "webm", "public.movie"})`,
    ]);
    const picked = String(stdout || "").trim();
    return picked || null;
  }

  throw new Error("Choose video from PC is only supported when the server runs on Windows or macOS.");
};
