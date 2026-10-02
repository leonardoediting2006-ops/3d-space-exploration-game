// Minimal Electron main process used by the e2e harness when a browser with H.264 encoding is needed
// (the stock headless Chromium has no H.264 encoder). Playwright attaches to it over CDP.
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1600, height: 950, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  win.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
