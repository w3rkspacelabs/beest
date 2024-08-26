import { Command } from 'src/command'
import { isCancel, cancel, text, spinner, confirm } from '@clack/prompts';
import { createFundingWallet, drainTo, drainXdai, isEtherproxyRunning } from '../web3';
import { BEES_DIR, BEEST_PASSWORD_FILE, getConfig, KEY } from '../config';
import { ask, listFolders } from '../utils';
import { fs } from 'zx';

export class DrainAllFunds implements Command {
  command = 'drain-all-funds'
  describe = 'Drain funds from all the bee node wallets'
  interactiveMode = true;
  async handler(args: any) {
  //   await this.drain(true);
  // }
  // async drain(interactiveMode = true) {
    let fundingWallet = getConfig(KEY.FUNDING_WALLET, '')
    const s = spinner()

    let dirs = listFolders(BEES_DIR)
    let pwd = fs.readFileSync(BEEST_PASSWORD_FILE).toString().trim()
    if (fundingWallet == '') {
      fundingWallet = createFundingWallet()
    }
    for (let i in dirs) {
      let dir = dirs[i]
      let keyFile = `${BEES_DIR}/${dir}/keys/swarm.key`
      if (fs.existsSync(keyFile)) {
        s.start(`Draining ${keyFile}`)
        const res = await drainXdai(keyFile, pwd, fundingWallet);
        s.stop(res)
      } else {
        let msg = `Wallet ${keyFile} not found. Skipping.`
        s.start(msg)
        s.stop(msg)
      }
    }
    // if (this.interactiveMode) {
    //   const yn = await confirm({
    //     message: `Would you like to transfer all the funds in the funding wallet to an external address?`,
    //     initialValue: false
    //   })
    //   if (yn) {
    //     const targetWallet = await text({
    //       message: ask('Wallet to drain to', '--to', '-t'),
    //       placeholder: '',
    //       initialValue: '',
    //       validate(value) {
    //         if (value == fundingWallet) {
    //           return `Cannot drain from funding wallet to itself!`
    //         }
    //       }
    //     });

    //     if (isCancel(targetWallet)) {
    //       cancel('Operation cancelled.');
    //       process.exit(0);
    //     }

    //     if (fundingWallet != targetWallet) {
    //       s.start(`Draining from funding wallet ${fundingWallet} to ${targetWallet}`)
    //       const msg = await drainTo(targetWallet)
    //       s.stop(msg)
    //     }
    //   }
    // }

  }
}
