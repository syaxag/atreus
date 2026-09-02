import koffi from 'koffi';

/**
 * Enumeración de procesos de Windows mediante Toolhelp32.
 *
 * Es lo único que Atreus necesita saber del sistema: qué juego está abierto,
 * para contar el tiempo de sesión. No abre procesos ni lee su memoria — de eso
 * se encargaba el antiguo motor de cheats, que ya no existe.
 */

const TH32CS_SNAPPROCESS = 0x00000002;
const INVALID_HANDLE = -1;

const PROCESSENTRY32W = koffi.struct('PROCESSENTRY32W', {
  dwSize: 'uint32',
  cntUsage: 'uint32',
  th32ProcessID: 'uint32',
  th32DefaultHeapID: 'uintptr',
  th32ModuleID: 'uint32',
  cntThreads: 'uint32',
  th32ParentProcessID: 'uint32',
  pcPriClassBase: 'int32',
  dwFlags: 'uint32',
  szExeFile: 'char16_t [260]',
});

const kernel32 = koffi.load('kernel32.dll');
const CreateToolhelp32Snapshot = kernel32.func('intptr CreateToolhelp32Snapshot(uint32 flags, uint32 pid)');
const Process32FirstW = kernel32.func('bool Process32FirstW(intptr snapshot, _Inout_ PROCESSENTRY32W *entry)');
const Process32NextW = kernel32.func('bool Process32NextW(intptr snapshot, _Inout_ PROCESSENTRY32W *entry)');
const CloseHandle = kernel32.func('bool CloseHandle(intptr handle)');

export interface ProcessInfo {
  pid: number;
  name: string;
}

/** Lista los procesos en ejecución. Devuelve vacío si el sistema no deja mirar. */
export function listProcesses(): ProcessInfo[] {
  const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot === INVALID_HANDLE) return [];

  const out: ProcessInfo[] = [];
  try {
    const entry = { dwSize: koffi.sizeof(PROCESSENTRY32W) } as Record<string, unknown>;
    let more = Process32FirstW(snapshot, entry);
    while (more) {
      out.push({ pid: entry['th32ProcessID'] as number, name: entry['szExeFile'] as string });
      entry['dwSize'] = koffi.sizeof(PROCESSENTRY32W);
      more = Process32NextW(snapshot, entry);
    }
  } finally {
    CloseHandle(snapshot);
  }
  return out;
}
