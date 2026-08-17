import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const source = resolve('native', 'DotaScout.Win32Helper.cs')
const output = resolve('native', 'DotaScout.Win32Helper.exe')
const overlaySource = resolve('native', 'DotaScout.NativeOverlay.cs')
const overlayOutput = resolve('native', 'DotaScout.NativeOverlay.exe')
const candidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
]
const compiler = candidates.find(existsSync)
if (!compiler) throw new Error('未找到 Windows .NET Framework C# 编译器，无法构建 Win32 Overlay Helper。')

mkdirSync(dirname(output), { recursive: true })
execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${output}`, source], { stdio: 'inherit', windowsHide: true })
execFileSync(compiler, ['/nologo', '/optimize+', '/target:winexe', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', `/out:${overlayOutput}`, overlaySource], { stdio: 'inherit', windowsHide: true })
console.log(`Win32 Overlay Helper: ${output}`)
console.log(`Native Overlay PoC: ${overlayOutput}`)
