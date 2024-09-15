import { Command } from 'src/command'
import { cancel, confirm, spinner } from '@clack/prompts'
import { BEES_DIR, getConfig, KEY, putConfig } from '../config'
import { $ } from 'zx'
import { listFolders, rmDir, saveAllProcesses } from '../utils'
import { DrainAllFunds } from './drain-all-funds'
import { green, red } from 'picocolors'

export class DeleteBees implements Command {
  command = 'delete-all-bees'
  describe = 'Delete all bees'
  interactiveMode = true
  async handler(args: any) {
    // const drain = new DrainAllFunds()
    // process.exit(0);
    const s = spinner()
    s.start(`Stopping all bees before deleting the bees`)
    try {
      await $`pm2 stop beest -s`
    } catch (err) {}

    s.stop(`Stopped all bees.`)

    const yn = await confirm({
      message: `Are you sure you want to delete all bee nodes?`,
      initialValue: false,
    })
    if (yn) {
      const drainer = new DrainAllFunds()
      drainer.interactiveMode = false
      await drainer.handler(args)
      // s.start(`All bee node funds drained to Funding Wallet`)
      s.start(`Deleting all bee node data`)
      const bees = getConfig(KEY.BEES, [])
      const beedirs = listFolders(BEES_DIR)
      return;
      if (beedirs.length > 0) {
        rmDir(BEES_DIR)
        putConfig(KEY.BEES, [])
        try {
          await $`pm2 delete beest -s`
          await $`pm2 flush beest -s`
          await saveAllProcesses()
        } catch (err) {}
        s.stop(green(`Deleted all bee nodes`))
      } else {
        s.stop(green(`No bees to delete!`))
      }
    } else {
      s.stop(red(`Operation cancelled`))
    }
  }
}
