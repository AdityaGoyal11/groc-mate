import { exec } from 'node:child_process'
import { platform } from 'node:os'

export function openUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const cmd =
      platform() === 'darwin' ? `open "${url}"` :
      platform() === 'win32' ? `start "" "${url}"` :
      `xdg-open "${url}"`

    exec(cmd, () => resolve())
  })
}
