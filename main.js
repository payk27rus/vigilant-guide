const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let pendingFile = null;

function getFileFromArgs(argv) {
  for (const arg of argv) {
    if (!arg || arg.startsWith('-')) continue;
    if (/\.(mlg|csv|json)$/i.test(arg) && fs.existsSync(arg)) return path.resolve(arg);
  }
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1000, minHeight: 600,
    backgroundColor: '#0a0c10', show: false,
    title: 'MLVLG // Просмотр логов',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const file = pendingFile || getFileFromArgs(process.argv);
    if (file) { sendFileToRenderer(file); pendingFile = null; }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Открыть лог…', accelerator: 'CmdOrCtrl+O', click: () => pickAndSend() },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'Alt+F4', role: 'quit' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' }, { role: 'selectAll', label: 'Выделить всё' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'toggleDevTools', label: 'DevTools (F12)' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Масштаб 100%' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полный экран (F11)' }
      ]
    },
    {
      label: 'Справка',
      submenu: [{
        label: 'О программе',
        click: () => dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'MLVLG Viewer',
          message: `MLVLG Viewer v${app.getVersion()}`,
          detail: `Electron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode ${process.versions.node}`,
          buttons: ['OK']
        })
      }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function pickAndSend() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Логи', extensions: ['mlg', 'csv', 'json'] },
      { name: 'Все файлы', extensions: ['*'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) sendFileToRenderer(result.filePaths[0]);
}

function sendFileToRenderer(filePath) {
  if (!mainWindow) return;
  try {
    const data = fs.readFileSync(filePath);
    mainWindow.webContents.send('open-file', {
      name: path.basename(filePath),
      path: filePath,
      ext: path.extname(filePath).toLowerCase().slice(1),
      buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    });
  } catch (e) {
    dialog.showErrorBox('Ошибка чтения файла', e.message);
  }
}

ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Логи', extensions: ['mlg', 'csv', 'json'] }, { name: 'Все файлы', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('read-file', async (evt, filePath) => {
  const data = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    ext: path.extname(filePath).toLowerCase().slice(1),
    buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (evt, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const file = getFileFromArgs(argv);
      if (file) sendFileToRenderer(file);
    }
  });
  app.whenReady().then(() => { buildMenu(); createWindow(); });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
