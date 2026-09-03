import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AtreusApi, AtreusEvents } from '@shared/ipc';
import { EVENT_CHANNELS } from '@shared/ipc';

/**
 * Puente entre el renderer y el main.
 *
 * El renderer no tiene Node: todo lo que puede hacer pasa por aquí, y la forma
 * de este objeto es exactamente `AtreusApi` (docs/CONTRACT.md).
 */

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: AtreusApi = {
  library: {
    list: () => invoke('library.list'),
    scan: () => invoke('library.scan'),
    get: (id) => invoke('library.get', id),
    addManual: (exePath) => invoke('library.addManual', exePath),
    remove: (id) => invoke('library.remove', id),
    setFavorite: (id, favorite) => invoke('library.setFavorite', id, favorite),
    launch: (id, args) => invoke('library.launch', id, args),
  },

  steam: {
    open: (appId) => invoke('steam.open', appId),
    close: (appId) => invoke('steam.close', appId),
    achievements: (appId) => invoke('steam.achievements', appId),
    stats: (appId) => invoke('steam.stats', appId),
    commit: (appId, patch) => invoke('steam.commit', appId, patch),
    backups: (appId) => invoke('steam.backups', appId),
    restore: (appId, snapshotId) => invoke('steam.restore', appId, snapshotId),
    resetAll: (appId) => invoke('steam.resetAll', appId),
    checkKey: () => invoke('steam.checkKey'),
  },

  xbox: {
    checkKey: () => invoke('xbox.checkKey'),
  },

  achievements: {
    list: (gameId) => invoke('achievements.list', gameId),
    mark: (gameId, patches) => invoke('achievements.mark', gameId, patches),
  },

  platinum: {
    report: (gameId, refresh) => invoke('platinum.report', gameId, refresh),
    summaries: () => invoke('platinum.summaries'),
  },

  mods: {
    list: (gameId) => invoke('mods.list', gameId),
    install: (gameId, archivePath) => invoke('mods.install', gameId, archivePath),
    uninstall: (gameId, modId) => invoke('mods.uninstall', gameId, modId),
    setEnabled: (gameId, modId, enabled) => invoke('mods.setEnabled', gameId, modId, enabled),
    reorder: (gameId, modIds) => invoke('mods.reorder', gameId, modIds),
    previewDeploy: (gameId) => invoke('mods.previewDeploy', gameId),
    deploy: (gameId) => invoke('mods.deploy', gameId),
    purge: (gameId) => invoke('mods.purge', gameId),
    profiles: (gameId) => invoke('mods.profiles', gameId),
    saveProfile: (profile) => invoke('mods.saveProfile', profile),
    activateProfile: (gameId, profileId) => invoke('mods.activateProfile', gameId, profileId),
    deleteProfile: (gameId, profileId) => invoke('mods.deleteProfile', gameId, profileId),
    discover: (gameId) => invoke('mods.discover', gameId),
    installRemote: (gameId, mod) => invoke('mods.installRemote', gameId, mod),
  },

  guides: {
    list: (gameId, category, query, refresh) => invoke('guides.list', gameId, category, query, refresh),
    read: (entry) => invoke('guides.read', entry),
  },

  maps: {
    list: (gameId, refresh) => invoke('maps.list', gameId, refresh),
    add: (gameId, input) => invoke('maps.add', gameId, input),
    remove: (gameId, mapId) => invoke('maps.remove', gameId, mapId),
  },

  content: {
    availability: () => invoke('content.availability'),
  },

  progress: {
    get: (gameId) => invoke('progress.get', gameId),
    save: (progress) => invoke('progress.save', progress),
  },

  settings: {
    get: () => invoke('settings.get'),
    set: (patch) => invoke('settings.set', patch),
    pickFolder: (title) => invoke('settings.pickFolder', title),
    pickFile: (title, filters) => invoke('settings.pickFile', title, filters),
    openPath: (path) => invoke('settings.openPath', path),
  },

  catalog: {
    sync: () => invoke('catalog.sync'),
    version: () => invoke('catalog.version'),
  },

  app: {
    version: () => invoke('app.version'),
    checkForUpdates: () => invoke('app.checkForUpdates'),
    downloadUpdate: () => invoke('app.downloadUpdate'),
    openLogs: () => invoke('app.openLogs'),
    minimize: () => ipcRenderer.send('window.minimize'),
    maximize: () => ipcRenderer.send('window.maximize'),
    close: () => ipcRenderer.send('window.close'),
  },

  on: (channel, handler) => {
    // Solo se admiten canales del contrato: nada de suscripciones arbitrarias.
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(`Canal de evento desconocido: ${String(channel)}`);
    }
    const wrapped = (_e: IpcRendererEvent, payload: AtreusEvents[typeof channel]) =>
      handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => { ipcRenderer.off(channel, wrapped); };
  },
};

contextBridge.exposeInMainWorld('atreus', api);
