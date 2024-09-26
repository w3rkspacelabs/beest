import arg from 'arg'
import { intro, outro, select, spinner } from '@clack/prompts'
import { commands } from '../src'
import { BEEST, getAllConfig, GOODBYE, initBeest, installBee } from '../src/config'
import { ask, ensureGlobalNpmCommandExists, printBeestProcesses } from '../src/utils'
import { Command } from '../src/command'

const ARGS_DB = {
  '--action': String,
  '-a': '--action',
}

async function main() {
  process.env.FORCE_COLOR = '3' // preserves colored output with zx piped outputs
  const DB = await initBeest()
  // console.log(await getAllConfig())
  const args = arg(ARGS_DB)
  let cmdlist: { label: string; value: any; hint: string }[] = []
  const commandList: Command[] = commands
  for (const cmd of commandList) {
    cmdlist.push({ label: cmd.describe, value: cmd.command, hint: cmd.command })
  }
  if (process.argv.length < 3) {
    intro(`${BEEST}`)
    await installBee()
    await ensureGlobalNpmCommandExists('etherproxy')
    await ensureGlobalNpmCommandExists('pm2')
    const s = spinner()
    s.start('Fetching beest processes')
    s.stop('Process List:')
    await printBeestProcesses();
    const cmd = (await select({
      message: ask('Select an action', '--action', '-a'),
      options: cmdlist,
    })) as string
    if (cmd) {
      try {
        await commands.find((c) => c.command === cmd)?.handler(args)
      } catch (err) {
        console.log(err)
        throw err
      }
    }
    outro(GOODBYE)
  }
}

main()
