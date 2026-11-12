"""Summarize committed virtual regions without reading process memory contents."""
import argparse
import ctypes
from ctypes import wintypes
import json
import sys

if sys.platform != 'win32':
    raise RuntimeError('This diagnostic requires Windows')


class MemoryBasicInformation(ctypes.Structure):
    _fields_ = [('BaseAddress', ctypes.c_void_p), ('AllocationBase', ctypes.c_void_p),
                ('AllocationProtect', wintypes.DWORD), ('PartitionId', wintypes.WORD),
                ('RegionSize', ctypes.c_size_t), ('State', wintypes.DWORD),
                ('Protect', wintypes.DWORD), ('Type', wintypes.DWORD)]


kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.VirtualQueryEx.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(MemoryBasicInformation), ctypes.c_size_t]
kernel.VirtualQueryEx.restype = ctypes.c_size_t
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.CloseHandle.restype = wintypes.BOOL
kernel.K32QueryWorkingSetEx.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
kernel.K32QueryWorkingSetEx.restype = wintypes.BOOL


class WorkingSetEntry(ctypes.Structure):
    _fields_ = [('address', ctypes.c_void_p), ('attributes', ctypes.c_size_t)]


def inspect(pid, sample_residency=False):
    handle = kernel.OpenProcess(0x0400, False, pid)  # PROCESS_QUERY_INFORMATION
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    allocations = {}; regions = {}; totals = {'private': 0, 'mapped': 0, 'image': 0, 'other': 0}
    types = {0x20000: 'private', 0x40000: 'mapped', 0x1000000: 'image'}
    address = 0
    try:
        while True:
            info = MemoryBasicInformation()
            if not kernel.VirtualQueryEx(handle, ctypes.c_void_p(address), ctypes.byref(info), ctypes.sizeof(info)):
                error = ctypes.get_last_error()
                if error == 87: break  # Address is above the target's accessible range.
                raise ctypes.WinError(error)
            size = info.RegionSize
            if not size: raise RuntimeError('VirtualQueryEx returned an empty region')
            if info.State == 0x1000:  # MEM_COMMIT, not necessarily resident
                kind = types.get(info.Type, 'other')
                totals[kind] += size
                key = (info.AllocationBase, kind)
                allocations[key] = allocations.get(key, 0) + size
                if sample_residency: regions.setdefault(key, []).append((info.BaseAddress, size))
            next_address = (info.BaseAddress or 0) + size
            if next_address <= address: raise RuntimeError('Virtual address enumeration did not advance')
            address = next_address
        largest = []
        for key, size in sorted(allocations.items(), key=lambda item: item[1], reverse=True)[:10]:
            item = {'type': key[1], 'committed_bytes': size}
            if sample_residency:
                addresses = [start + offset for start, length in regions[key] for offset in range(0, length, 1024 * 1024)]
                entries = (WorkingSetEntry * len(addresses))(*(WorkingSetEntry(address, 0) for address in addresses))
                if not kernel.K32QueryWorkingSetEx(handle, entries, ctypes.sizeof(entries)):
                    raise ctypes.WinError(ctypes.get_last_error())
                item.update(sampled_pages=len(entries), sampled_valid=sum(bool(entry.attributes & 1) for entry in entries), sample_stride_bytes=1024 * 1024)
            largest.append(item)
    finally:
        kernel.CloseHandle(handle)
    return {'pid': pid, 'committed_by_type_bytes': totals, 'largest_allocations': largest,
            'note': 'Commit sizes and sparsely sampled valid flags are not additive resident-byte measurements or proof of GPU spill; process contents were not read.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--sample-residency', action='store_true')
    args = parser.parse_args()
    print(json.dumps(inspect(args.pid, args.sample_residency)))
