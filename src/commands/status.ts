import { Command } from 'src/command'
import { isCancel, cancel, text, outro } from '@clack/prompts'
import { $, fetch, fs } from 'zx'
import Table from 'cli-tableau'
import { green, red } from 'picocolors'
import { getConfig, GOODBYE, KEY, putConfig } from '../config'
import { console_log, fetchURL, getBool, getProcList, printBeeProcesses, printStartupSetup } from '../utils'
import { getNativeBalance } from '../web3'

export class Status implements Command {
  command = 'status'
  describe = 'Print quick status report of all bees'
  interactiveMode = true;
  async handler(args: any) {
    await printBeeProcesses();
    let fundingWallet = getConfig(KEY.FUNDING_WALLET,'')
    let fundBalance = await getNativeBalance(fundingWallet)
  }
}
