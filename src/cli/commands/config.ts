import { Command } from 'commander'
import chalk from 'chalk'
import { createInterface } from 'node:readline/promises'
import { appConfig } from '../../config/config.js'
import keytar from 'keytar'
import type { StoreId } from '../../adapters/types.js'

const SERVICE = 'groc-mate'

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage groc-mate configuration')

  cmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action((key: string, value: string) => {
      switch (key) {
        case 'defaultSuburb':
          appConfig.set('defaultSuburb', value)
          break
        case 'defaultStores':
          appConfig.set('defaultStores', value.split(',').map((s) => s.trim()) as StoreId[])
          break
        case 'cacheTTLMinutes':
          appConfig.set('cacheTTLMinutes', parseInt(value, 10))
          break
        case 'colesRPMLimit':
          appConfig.set('colesRPMLimit', parseInt(value, 10))
          break
        default:
          console.error(chalk.red(`Unknown config key: ${key}`))
          process.exit(1)
      }
      console.log(chalk.green(`✓ Set ${key} = ${value}`))
    })

  cmd
    .command('get [key]')
    .description('Get a config value or show all config')
    .action((key?: string) => {
      if (key) {
        console.log(appConfig.get(key as never))
      } else {
        console.log(appConfig.store)
      }
    })

  cmd
    .command('set-cookie <store>')
    .description('Save a session cookie for a store (enables logged-in cart fill)')
    .action(async (store: string) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      console.log(chalk.dim('Open DevTools in your browser, go to Application → Cookies, copy the full cookie string.'))
      const cookie = await rl.question(`Paste ${store} session cookie: `)
      rl.close()

      if (!cookie.trim()) {
        console.error(chalk.red('No cookie provided.'))
        process.exit(1)
      }

      await keytar.setPassword(SERVICE, `cookie-${store}`, cookie.trim())
      console.log(chalk.green(`✓ Cookie saved for ${store} (stored in OS keychain)`))
    })

  cmd
    .command('del-cookie <store>')
    .description('Remove stored session cookie for a store')
    .action(async (store: string) => {
      await keytar.deletePassword(SERVICE, `cookie-${store}`)
      console.log(chalk.green(`✓ Cookie removed for ${store}`))
    })

  cmd
    .command('set-anthropic-key')
    .description('Save Anthropic API key for meal planning')
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const key = await rl.question('Paste your Anthropic API key (sk-ant-...): ')
      rl.close()

      if (!key.trim().startsWith('sk-ant-')) {
        console.error(chalk.red('Invalid key format.'))
        process.exit(1)
      }

      await keytar.setPassword(SERVICE, 'anthropic-key', key.trim())
      appConfig.set('anthropicKeySet', true)
      console.log(chalk.green('✓ Anthropic key saved (stored in OS keychain)'))
    })

  return cmd
}

export async function getSessionCookie(store: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, `cookie-${store}`)
}

export async function getAnthropicKey(): Promise<string | null> {
  return keytar.getPassword(SERVICE, 'anthropic-key')
}
