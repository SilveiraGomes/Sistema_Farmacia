const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function setupAutoUpdateService({
  app,
  autoUpdater,
  dialog,
  getMainWindow,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  logger = console,
} = {}) {
  if (!app?.isPackaged) return () => {};
  if (!autoUpdater || !dialog || typeof getMainWindow !== 'function') {
    throw new Error('Update service dependencies are required');
  }

  let timer = null;
  let downloadPromptOpen = false;
  let installPromptOpen = false;
  const deferredVersions = new Set();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const check = async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.warn?.('Não foi possível verificar actualizações:', error?.message || error);
    }
  };

  const onUpdateAvailable = async (info = {}) => {
    const version = String(info.version || '').trim();
    if (downloadPromptOpen || deferredVersions.has(version)) return;
    downloadPromptOpen = true;
    try {
      const { response } = await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Nova actualização disponível',
        message: version
          ? `A versão ${version} do KILSYSTEM PHARMACY está disponível.`
          : 'Uma nova versão do KILSYSTEM PHARMACY está disponível.',
        detail: 'Deseja transferir a actualização agora? Pode continuar a trabalhar durante a transferência.',
        buttons: ['Transferir actualização', 'Mais tarde'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) {
        await autoUpdater.downloadUpdate();
      } else if (version) {
        deferredVersions.add(version);
      }
    } catch (error) {
      logger.warn?.('Não foi possível transferir a actualização:', error?.message || error);
    } finally {
      downloadPromptOpen = false;
    }
  };

  const onUpdateDownloaded = async (info = {}) => {
    if (installPromptOpen) return;
    installPromptOpen = true;
    try {
      const version = String(info.version || '').trim();
      const { response } = await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Actualização pronta',
        message: version
          ? `A versão ${version} foi transferida com sucesso.`
          : 'A nova versão foi transferida com sucesso.',
        detail: 'Reinicie a aplicação para concluir a instalação. Se escolher “Mais tarde”, será instalada ao encerrar.',
        buttons: ['Reiniciar e instalar', 'Mais tarde'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      logger.warn?.('Não foi possível apresentar a actualização:', error?.message || error);
    } finally {
      installPromptOpen = false;
    }
  };

  const onError = (error) => {
    logger.warn?.('Erro no actualizador automático:', error?.message || error);
  };

  autoUpdater.on('update-available', onUpdateAvailable);
  autoUpdater.on('update-downloaded', onUpdateDownloaded);
  autoUpdater.on('error', onError);

  void check();
  timer = setInterval(() => void check(), checkIntervalMs);
  timer.unref?.();

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    autoUpdater.removeListener?.('update-available', onUpdateAvailable);
    autoUpdater.removeListener?.('update-downloaded', onUpdateDownloaded);
    autoUpdater.removeListener?.('error', onError);
  };
}

module.exports = { DEFAULT_CHECK_INTERVAL_MS, setupAutoUpdateService };
