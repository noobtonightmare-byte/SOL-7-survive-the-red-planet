const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), path = require('path');
/* SAVE SYSTEM: the save lives in a real file in the user's app-data folder (written atomically) */
const saveFile = () => path.join(app.getPath('userData'), 'sol7-save.json');
ipcMain.on('sol-save-read', e => { try { const f = saveFile(); e.returnValue = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; } catch (x) { e.returnValue = null; } });
ipcMain.on('sol-save-write', (e, s) => { try { const f = saveFile(), t = f + '.tmp'; fs.writeFileSync(t, String(s)); fs.renameSync(t, f); e.returnValue = true; } catch (x) { e.returnValue = false; } });
ipcMain.on('sol-save-clear', e => { try { fs.rmSync(saveFile(), { force: true }); e.returnValue = true; } catch (x) { e.returnValue = false; } });
function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, title: 'SOL 7', backgroundColor: '#000',
    autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.maximize();
  win.loadFile('launch.html');
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
