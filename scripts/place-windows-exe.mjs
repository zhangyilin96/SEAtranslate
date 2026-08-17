import { copyFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve('release', 'Dota Scout.exe')
const target = resolve('Dota Scout.exe')

if (!existsSync(source) || statSync(source).size < 1_000_000) {
  throw new Error('没有找到有效的 Windows 便携版构建产物。')
}

copyFileSync(source, target)
console.log(`Windows 便携版已生成：${target}`)
