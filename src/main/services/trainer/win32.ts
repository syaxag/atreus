import koffi from 'koffi';

/**
 * Enlaces con las APIs de procesos y memoria de Windows.
 *
 * Se usa Toolhelp32 (`CreateToolhelp32Snapshot`) tanto para enumerar procesos
 * como para enumerar módulos: da la base y el tamaño de cada módulo de una sola
 * pasada, sin necesitar psapi ni un handle abierto con permisos de consulta.
 */

// ── Constantes ────────────────────────────────────────────────
export const TH32CS_SNAPPROCESS = 0x00000002;
export const TH32CS_SNAPMODULE = 0x00000008;
export const TH32CS_SNAPMODULE32 = 0x00000010;

/** Permisos mínimos para leer, escribir y consultar el mapa de memoria. */
export const PROCESS_ACCESS = 0x0010 | 0x0020 | 0x0400 | 0x0008;
//                            VM_READ  VM_WRITE QUERY_INFO VM_OPERATION

const INVALID_HANDLE = -1;

// Protecciones de página que nos interesan al escanear.
export const PAGE_GUARD = 0x100;
export const PAGE_NOACCESS = 0x01;
const READABLE = 0x02 | 0x04 | 0x08 | 0x20 | 0x40 | 0x80;
//               READONLY READWRITE WRITECOPY EXECUTE_READ EXECUTE_READWRITE EXECUTE_WRITECOPY

export const MEM_COMMIT = 0x1000;

// ── Estructuras ───────────────────────────────────────────────
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

const MODULEENTRY32W = koffi.struct('MODULEENTRY32W', {
  dwSize: 'uint32',
  th32ModuleID: 'uint32',
  th32ProcessID: 'uint32',
  GlblcntUsage: 'uint32',
  ProccntUsage: 'uint32',
  modBaseAddr: 'uintptr',
  modBaseSize: 'uint32',
  hModule: 'uintptr',
  szModule: 'char16_t [256]',
  szExePath: 'char16_t [260]',
});

const MEMORY_BASIC_INFORMATION = koffi.struct('MEMORY_BASIC_INFORMATION', {
  BaseAddress: 'uintptr',
  AllocationBase: 'uintptr',
  AllocationProtect: 'uint32',
  __alignment1: 'uint32',
  RegionSize: 'uintptr',
  State: 'uint32',
  Protect: 'uint32',
  Type: 'uint32',
  __alignment2: 'uint32',
});

// ── Funciones ─────────────────────────────────────────────────
const kernel32 = koffi.load('kernel32.dll');

const CreateToolhelp32Snapshot = kernel32.func(
  'intptr CreateToolhelp32Snapshot(uint32 flags, uint32 pid)',
);
const Process32FirstW = kernel32.func(
  'bool Process32FirstW(intptr snapshot, _Inout_ PROCESSENTRY32W *entry)',
);
const Process32NextW = kernel32.func(
  'bool Process32NextW(intptr snapshot, _Inout_ PROCESSENTRY32W *entry)',
);
const Module32FirstW = kernel32.func(
  'bool Module32FirstW(intptr snapshot, _Inout_ MODULEENTRY32W *entry)',
);
const Module32NextW = kernel32.func(
  'bool Module32NextW(intptr snapshot, _Inout_ MODULEENTRY32W *entry)',
);
const CloseHandle = kernel32.func('bool CloseHandle(intptr handle)');

const OpenProcess = kernel32.func(
  'intptr OpenProcess(uint32 access, bool inherit, uint32 pid)',
);
const ReadProcessMemory = kernel32.func(
  'bool ReadProcessMemory(intptr process, uintptr address, _Inout_ uint8 *buffer, size_t size, _Out_ size_t *read)',
);
const WriteProcessMemory = kernel32.func(
  'bool WriteProcessMemory(intptr process, uintptr address, uint8 *buffer, size_t size, _Out_ size_t *written)',
);
const VirtualQueryEx = kernel32.func(
  'size_t VirtualQueryEx(intptr process, uintptr address, _Out_ MEMORY_BASIC_INFORMATION *info, size_t length)',
);
const GetLastError = kernel32.func('uint32 GetLastError()');

// ── API de alto nivel ─────────────────────────────────────────
export interface ProcessInfo {
  pid: number;
  name: string;
}

export interface ModuleInfo {
  name: string;
  base: bigint;
  size: number;
  path: string;
}

export interface MemoryRegion {
  base: bigint;
  size: number;
  protect: number;
}

/** Lista los procesos en ejecución. */
export function listProcesses(): ProcessInfo[] {
  const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot === INVALID_HANDLE) return [];

  const out: ProcessInfo[] = [];
  try {
    const entry = { dwSize: koffi.sizeof(PROCESSENTRY32W) } as Record<string, unknown>;
    let more = Process32FirstW(snapshot, entry);
    while (more) {
      out.push({
        pid: entry['th32ProcessID'] as number,
        name: entry['szExeFile'] as string,
      });
      entry['dwSize'] = koffi.sizeof(PROCESSENTRY32W);
      more = Process32NextW(snapshot, entry);
    }
  } finally {
    CloseHandle(snapshot);
  }
  return out;
}

/** Primer proceso cuyo ejecutable coincide (sin distinguir mayúsculas). */
export function findProcessByName(exeName: string): ProcessInfo | null {
  const target = exeName.toLowerCase();
  return listProcesses().find((p) => p.name.toLowerCase() === target) ?? null;
}

/** Módulos cargados en un proceso, con su base y tamaño. */
export function listModules(pid: number): ModuleInfo[] {
  const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
  if (snapshot === INVALID_HANDLE) return [];

  const out: ModuleInfo[] = [];
  try {
    const entry = { dwSize: koffi.sizeof(MODULEENTRY32W) } as Record<string, unknown>;
    let more = Module32FirstW(snapshot, entry);
    while (more) {
      out.push({
        name: entry['szModule'] as string,
        base: BigInt(entry['modBaseAddr'] as number | bigint),
        size: entry['modBaseSize'] as number,
        path: entry['szExePath'] as string,
      });
      entry['dwSize'] = koffi.sizeof(MODULEENTRY32W);
      more = Module32NextW(snapshot, entry);
    }
  } finally {
    CloseHandle(snapshot);
  }
  return out;
}

export function findModule(pid: number, moduleName: string): ModuleInfo | null {
  const target = moduleName.toLowerCase();
  return listModules(pid).find((m) => m.name.toLowerCase() === target) ?? null;
}

/** Abre un proceso con permisos de lectura/escritura. 0 si falla. */
export function openProcess(pid: number): number {
  const handle = OpenProcess(PROCESS_ACCESS, false, pid);
  return handle === 0 ? 0 : handle;
}

export function closeProcess(handle: number): void {
  if (handle) CloseHandle(handle);
}

export function lastError(): number {
  return GetLastError();
}

/** Lee `size` bytes. Devuelve null si la lectura falla o es parcial. */
export function readMemory(handle: number, address: bigint, size: number): Buffer | null {
  const buffer = Buffer.alloc(size);
  const read = [0];
  const ok = ReadProcessMemory(handle, address, buffer, size, read);
  if (!ok || read[0] !== size) return null;
  return buffer;
}

/** Escribe un buffer. Devuelve false si la escritura falla o es parcial. */
export function writeMemory(handle: number, address: bigint, data: Buffer): boolean {
  const written = [0];
  const ok = WriteProcessMemory(handle, address, data, data.length, written);
  return ok === true && written[0] === data.length;
}

/**
 * Regiones de memoria confirmadas y legibles del proceso.
 *
 * Se saltan las páginas con `PAGE_GUARD`: tocarlas dispara una excepción en el
 * proceso objetivo, que es justo lo que no queremos al escanear.
 */
export function readableRegions(handle: number, limit = 0x7fffffffffffn): MemoryRegion[] {
  const regions: MemoryRegion[] = [];
  const info = {} as Record<string, unknown>;
  const infoSize = koffi.sizeof(MEMORY_BASIC_INFORMATION);

  let address = 0n;
  while (address < limit) {
    const written = VirtualQueryEx(handle, address, info, infoSize);
    if (written === 0) break;

    const size = BigInt(info['RegionSize'] as number | bigint);
    if (size === 0n) break;

    const state = info['State'] as number;
    const protect = info['Protect'] as number;

    if (
      state === MEM_COMMIT &&
      (protect & READABLE) !== 0 &&
      (protect & PAGE_GUARD) === 0 &&
      (protect & PAGE_NOACCESS) === 0
    ) {
      regions.push({
        base: BigInt(info['BaseAddress'] as number | bigint),
        size: Number(size),
        protect,
      });
    }
    address += size;
  }
  return regions;
}
