import {
  LIBRARY_FORMAT,
  LIBRARY_VERSION,
  LIMITS,
  validateLibrary,
  validateMap,
} from "./model.js";

const KEY = "europa-canvas-v1";
const CHECKPOINT = "europa-canvas-checkpoint";
const RAW_KEY = "europa-canvas-unreadable";

export function emptyLibrary() {
  return {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    autosave: null,
    previousAutosave: null,
    recovery: null,
    slots: [null, null, null, null, null, null],
    libraryBackup: null,
    meta: {},
  };
}

export function createStorage({ onConflict, onStatus, onRemote }) {
  const tabId = `t${Math.random().toString(36).slice(2, 8)}`;
  let library = emptyLibrary();
  let baseRevision = 0;
  let dirty = false;
  let paused = false;
  let lastError = "";

  function setStatus(message, tone = "info") {
    lastError = tone === "error" ? message : "";
    onStatus?.({ message, tone, paused, storageFull: tone === "error" && /full/i.test(message) });
  }

  function readRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      setStatus("This browser blocked local storage. Export a JSON copy to keep your map.", "error");
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      const full = error?.name === "QuotaExceededError" || error?.code === 22;
      setStatus(
        full
          ? "Browser storage is full. Export your map before it is lost."
          : "This browser could not store the map. Export a JSON copy.",
        "error",
      );
      return false;
    }
  }

  function adopt(next, { silent } = {}) {
    library = next;
    baseRevision = next.revision || 0;
    dirty = false;
    paused = false;
    if (!silent) setStatus("Loaded the latest saved library.", "ok");
    onRemote?.(library);
  }

  function load(catalog) {
    const raw = readRaw(KEY);
    if (!raw) {
      library = emptyLibrary();
      baseRevision = 0;
      return library;
    }
    try {
      const parsed = JSON.parse(raw);
      const result = validateLibrary(parsed, catalog);
      if (!result.ok) throw new Error(result.error);
      library = { ...emptyLibrary(), ...result.library, libraryBackup: parsed.libraryBackup || null };
      baseRevision = library.revision || 0;
      return library;
    } catch (error) {
      writeRaw(RAW_KEY, raw);
      const checkpointRaw = readRaw(CHECKPOINT);
      if (checkpointRaw) {
        try {
          const checkpoint = JSON.parse(checkpointRaw);
          const recovered = validateLibrary(
            { ...emptyLibrary(), ...checkpoint, format: LIBRARY_FORMAT, version: LIBRARY_VERSION },
            catalog,
          );
          if (recovered.ok) {
            library = recovered.library;
            baseRevision = library.revision || 0;
            setStatus("The save library could not be read. Restored the last good checkpoint.", "error");
            return library;
          }
        } catch {
          /* fall through */
        }
      }
      library = emptyLibrary();
      baseRevision = 0;
      setStatus("Saved data could not be read. An unreadable copy was kept on this browser.", "error");
      return library;
    }
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(library));
  }

  function commit(next) {
    const remoteRaw = readRaw(KEY);
    if (remoteRaw) {
      try {
        const remote = JSON.parse(remoteRaw);
        if (Number(remote.revision || 0) !== baseRevision) {
          paused = true;
          onConflict?.(remote, snapshot());
          setStatus("Another tab changed this library. Autosave is paused.", "error");
          return false;
        }
      } catch {
        writeRaw(RAW_KEY, remoteRaw);
      }
    }
    next.revision = baseRevision + 1;
    next.updatedAt = new Date().toISOString();
    next.format = LIBRARY_FORMAT;
    next.version = LIBRARY_VERSION;
    const text = JSON.stringify(next);
    if (text.length > LIMITS.libraryChars) {
      setStatus("The save library is too large to store. Export it instead.", "error");
      return false;
    }
    if (!writeRaw(KEY, text)) return false;
    writeRaw(
      CHECKPOINT,
      JSON.stringify({
        format: LIBRARY_FORMAT,
        version: LIBRARY_VERSION,
        revision: next.revision,
        autosave: next.autosave,
        previousAutosave: next.previousAutosave,
        recovery: next.recovery,
        slots: next.slots,
        meta: next.meta,
      }),
    );
    library = next;
    baseRevision = next.revision;
    dirty = false;
    paused = false;
    setStatus("Saved in this browser.", "ok");
    return true;
  }

  function touch(mutator) {
    if (paused) {
      setStatus("Autosave is paused until the other tab’s changes are resolved.", "error");
      return false;
    }
    const next = snapshot();
    mutator(next);
    return commit(next);
  }

  function noteDirty() {
    dirty = true;
  }

  function autosave(map) {
    if (paused) return false;
    return touch((next) => {
      if (next.autosave) next.previousAutosave = next.autosave;
      next.autosave = map;
    });
  }

  function saveSlot(index, map) {
    return touch((next) => {
      next.slots[index] = map;
    });
  }

  function stashRecovery(map) {
    return touch((next) => {
      next.recovery = map;
    });
  }

  function remember(meta) {
    return touch((next) => {
      next.meta = { ...next.meta, ...meta };
    });
  }

  function replaceLibrary(nextLibrary) {
    const backup = snapshot();
    delete backup.libraryBackup;
    nextLibrary.libraryBackup = backup;
    nextLibrary.revision = baseRevision;
    return commit(nextLibrary);
  }

  function restoreLibraryBackup() {
    if (!library.libraryBackup) return false;
    const restored = library.libraryBackup;
    restored.revision = baseRevision;
    restored.libraryBackup = null;
    return commit(restored);
  }

  function keepLocal(localMapLibrary) {
    const remoteRaw = readRaw(KEY);
    if (remoteRaw) {
      try {
        baseRevision = Number(JSON.parse(remoteRaw).revision || baseRevision);
      } catch {
        /* keep the current base */
      }
    }
    paused = false;
    dirty = true;
    return commit(localMapLibrary);
  }

  function unreadableRaw() {
    return readRaw(RAW_KEY);
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== KEY || !event.newValue) return;
    let remote;
    try {
      remote = JSON.parse(event.newValue);
    } catch {
      return;
    }
    if (Number(remote.revision || 0) === baseRevision) return;
    if (!dirty && !paused) {
      adopt(remote);
      return;
    }
    paused = true;
    onConflict?.(remote, snapshot());
    setStatus("Another tab changed this library. Autosave is paused.", "error");
  });

  return {
    tabId,
    load,
    noteDirty,
    autosave,
    saveSlot,
    stashRecovery,
    remember,
    replaceLibrary,
    restoreLibraryBackup,
    keepLocal,
    adopt,
    unreadableRaw,
    get library() {
      return library;
    },
    get paused() {
      return paused;
    },
    get dirty() {
      return dirty;
    },
    resume() {
      paused = false;
    },
    validateMap,
    validateLibrary,
  };
}
