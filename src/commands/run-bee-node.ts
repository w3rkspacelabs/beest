import { Command } from '../command'
import { select, text, confirm, isCancel, cancel } from '@clack/prompts'
import { ask, console_log, delay, getGnosisRPC, mkdirp, printBeeProcesses, printStartupSetup } from '../utils'
import {
  freeBeePorts,
  newBeeId,
  beeDataDir,
  padBeeId,
  getConfig,
  putConfig,
  KEY,
  ETHERPROXY_PORT,
  ETHERPROXY_URL,
  GOODBYE,
  BEE_MODE,
  pushConfig,
  BEEST_PASSWORD_FILE,
  BEE,
  BIN_DIR,
  BEES_DIR,
} from '../config'
import { $, fs } from 'zx'
import { green, red } from 'picocolors'
import { spinner } from '@clack/prompts'
import {
  createFundingWallet,
  toDai,
  getAddressFromBeeDataDirectory,
  getNativeBalance,
  isEtherproxyReachable,
  isLessThan,
  makeDai,
  sendNativeTransaction,
  startEtherproxy,
  isEtherproxyRunning,
  isValidRPC,
} from '../web3'

export class RunBeeNode implements Command {
  command = 'run-bee-node'
  describe = 'Run a bee node'
  interactiveMode = true
  async handler(args: any) {
    const beeMode = await select({
      message: ask('Select bee mode', '--mode', '-m'),
      options: [
        { value: 'ultralight', label: 'Ultralight node', hint: 'Downloads only' },
        { value: 'light', label: 'Light node', hint: 'Downloads & Uploads' },
        { value: 'full', label: 'Full node', hint: 'Downloads, Uploads & Staking' },
      ],
    })

    const passFile = BEEST_PASSWORD_FILE
    const beeId = newBeeId()
    const datadir = beeDataDir(beeId)
    const verbosity = 'debug'
    const ports = await freeBeePorts()

    const prevBees = getConfig(KEY.BEES, [])

    if (beeMode == 'ultralight') {
      await startUltraLightNode({ beeId, datadir, passFile, verbosity, ports })
    } else if (beeMode == 'light') {
      await startNode({ beeId, datadir, passFile, verbosity, ports }, BEE_MODE.LIGHTNODE)
    } else if (beeMode == 'full') {
      await startNode({ beeId, datadir, passFile, verbosity, ports }, BEE_MODE.FULLNODE)
    }
    const currBees = getConfig(KEY.BEES, [])
    if (currBees.length == prevBees.length + 1) {
      const s = spinner()
      s.start('Fetching Beest processes')
      s.stop('Beest Process List:')
      await printBeeProcesses()
      s.start('Printing Beest processes')
      s.stop('Beest Service Setup:')
      await printStartupSetup()
    }
  }
}

async function startUltraLightNode({ beeId, datadir, passFile, verbosity, ports }) {
  const s = spinner()
  mkdirp(datadir)
  const configFile = `${datadir}/pm2.config.js`
  let beeCmd = `--api-addr :${ports[0]} --p2p-addr :${ports[1]} --password-file ${passFile} --data-dir ${datadir} --verbosity ${verbosity}`
  beeCmd += ` --swap-enable=false --full-node=false`
  let processName = `bee-${padBeeId(beeId)}-${ports[0]}`
  fs.writeFileSync(
    configFile,
    `module.exports = {
      apps: [
        {
          name: "${processName}",
          script: "${BIN_DIR}/bee",
          args: "start ${beeCmd}",
          watch: false,
          autorestart:false,
          namespace: 'beest'
        },
      ],
    };`,
  )

  s.start(`Starting Bee ultra-light node`)
  let command = `pm2 start --time --name ${beeId}-${ports[0]} -s ${configFile}`
  await $`pm2 start --time --name ${beeId}-${ports[0]} -s ${configFile}`
  // await $`pm2 save`
  s.stop(`Started Bee ultralight node at ${green(`http://localhost:${ports[0]}`)}`)
  let bee: BEE = {
    beeId,
    processName,
    port: ports[0],
    configFile: configFile,
    command,
    mode: BEE_MODE.ULTRALIGHT,
  }
  pushConfig(KEY.BEES, bee)
}

async function validateRpcURLs(urls: string) {
  let vals = urls.split(',')
  for (let i in vals) {
    let value = vals[i]
    let valid = await isValidRPC(value, 100)
    if (valid && value != ETHERPROXY_URL) {
      // do nothing
    } else {
      return red(
        `Invalid value: "${value}". Please provide a valid Gnosis endpoint (from getblock.io, alchemy.com, other providers or your own)`,
      )
    }
  }
}

async function promptGnosisRPC() {
  const oldRPC = getGnosisRPC()
  const gnosisRpc = await text({
    message: ask('Gnosis RPC Endpoints (one or more comma separated URLs)', '--gnosis-rpc', '-gr'),
    placeholder: oldRPC,
    initialValue: oldRPC,
    validate(values) {
      if (values.trim() == '') {
        return red(
          `Please provide a valid Gnosis endpoint (from getblock.io, alchemy.com, other providers or your own)`,
        )
      }
      let vals = values.split(',')
      for (let i in vals) {
        let value = vals[i]
        if (value == ETHERPROXY_URL) {
          return red(
            `Invalid target: "${value}". Please provide a valid Gnosis endpoint (from getblock.io, alchemy.com, other providers or your own)`,
          )
        }
      }
    },
  })

  if (isCancel(gnosisRpc)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  const s = spinner()
  const newRPC = gnosisRpc.toString().trim()
  if (oldRPC != newRPC) {
    s.start(`Testing Gnosis RPC endpoints: "${newRPC}"`)
    const errMsg = await validateRpcURLs(newRPC)
    if (errMsg) {
      s.stop(errMsg)
      return await promptGnosisRPC()
    } else {
      s.stop(green(`Gnosis RPC endpoints "${newRPC}" accepted!`))
      return { oldRPC, newRPC }
    }
  }
  return { oldRPC, newRPC }
}

async function startNode({ beeId, datadir, passFile, verbosity, ports }, mode: BEE_MODE) {
  mkdirp(datadir)
  const configFile = `${datadir}/pm2.config.js`
  let beeCmd = `--api-addr :${ports[0]} --p2p-addr :${ports[1]} --password-file ${passFile} --data-dir ${datadir} --verbosity ${verbosity}`
  const s = spinner()
  const { oldRPC, newRPC } = await promptGnosisRPC()

  await startEtherproxyIfNeeded(oldRPC, newRPC)

  const XDAI_MIN = '0.01'
  const minXdai = makeDai(XDAI_MIN)
  const { fundingWallet, fundBalance } = await ensureFundingWalletHasMinimumFunds('0.011')
  s.stop(`Funding Wallet ${fundingWallet} has ${toDai(fundBalance)} xDAI`)

  let processName = `bee-${padBeeId(beeId)}-${ports[0]}`

  beeCmd += ` --blockchain-rpc-endpoint ${ETHERPROXY_URL} --swap-enable=true --full-node=${mode == BEE_MODE.FULLNODE}`

  fs.writeFileSync(
    configFile,
    `module.exports = {
          apps: [
            {
              name: "${processName}",
              script: "${BIN_DIR}/bee",
              args: "start ${beeCmd}",
              watch: false,
              autorestart:false,
              namespace: 'beest'
            },
          ],
        };`,
  )

  s.start(`Initialising the Bee ${mode}`)
  await $`${BIN_DIR}/bee init --api-addr :${ports[0]} --p2p-addr :${ports[1]} --password-file ${passFile} --data-dir ${datadir}`
  const addr = getAddressFromBeeDataDirectory(datadir)
  s.stop(`Bee ${mode} initialised. Node wallet address: ${green(`0x${addr}`)}`)
  try {
    s.start(
      `Funding bee ${mode} with xDAI. Sending ${toDai(minXdai)} xDAI from the Beest funding wallet ${fundingWallet} (${toDai(fundBalance)} xDAI) .`,
    )
    const res = await sendNativeTransaction(getConfig(KEY.FUNDING_WALLET_PK, ''), `0x${addr}`, minXdai)
    s.stop(`Bee ${mode} funded with ${green(toDai(minXdai))} xDAI. Transaction Hash: ${green(res.transaction.hash)}`)
  } catch (err) {
    console.log({ err })
    await $`rm -rf ${datadir}`
    process.exit(0)
  }

  s.start(`Starting Bee ${mode}`)
  let command = `pm2 start --time --name ${beeId}-${ports[0]} -s ${configFile}`
  const out1 = (await $`pm2 start --time --name ${beeId}-${ports[0]} -s ${configFile}`).stdout
  s.stop(
    `Started Bee ${mode} at ${green(`http://localhost:${ports[0]}`)}. Type ${green(`"pm2 log ${processName}"`)} to check the bee logs.`,
  )
  let bee: BEE = {
    beeId,
    processName,
    port: ports[0],
    configFile: configFile,
    command,
    mode,
  }
  pushConfig(KEY.BEES, bee)
}

async function startEtherproxyIfNeeded(oldRPC, newRPC) {
  const s = spinner()
  if (newRPC != '') {
    putConfig(KEY.GNOSIS_RPC, newRPC)
  }
  const etherproxyRunning = await isEtherproxyRunning()
  const etherproxyReachable = await isEtherproxyReachable()
  const shouldStartEtherproxy = !(oldRPC == newRPC && etherproxyRunning && etherproxyReachable)
  if (shouldStartEtherproxy) {
    s.start('Starting etherproxy')
    const out = await startEtherproxy(ETHERPROXY_PORT, newRPC)
    await delay(5 * 1000) // FIXME temp fix for ECONNREFUSED error
    s.stop(`Etherproxy started at ${green(ETHERPROXY_URL)} with target(s): ${green(newRPC)}`)
  } else {
    s.start('Checking for Etherproxy')
    s.stop(`Etherproxy running at ${green(ETHERPROXY_URL)} with target(s): ${green(newRPC)}`)
  }
}

async function ensureFundingWalletHasMinimumFunds(minimumXdai: string = '0.011') {
  const s = spinner()
  let fundingWallet = getConfig(KEY.FUNDING_WALLET, '')
  if (fundingWallet != '') {
  } else {
    s.start('Beest funding wallet not found. Creating a new one')
    fundingWallet = createFundingWallet()
    s.stop(`Beest funding wallet created. Address: ${fundingWallet}`)
  }
  let fundBalance = await getNativeBalance(fundingWallet)

  const minXdaiValue = makeDai(minimumXdai)
  while (isLessThan(fundBalance, minXdaiValue)) {
    const confirmed = await confirm({
      message: `Have you funded the Beest funding wallet at ${fundingWallet} with atleast ${minimumXdai} xDAI per bee node?`,
    })
    const errorMessage = `|  Beest funding wallet must have atleast ${minimumXdai} xDAI to start a light node or a full node.`
    if (confirmed) {
      fundBalance = await getNativeBalance(fundingWallet)
      if (isLessThan(fundBalance, minXdaiValue)) {
        console.log(red(`${errorMessage} Beest funding wallet balance: ${toDai(fundBalance)}  xDAI.`))
      } else {
        break
      }
    } else {
      cancel(errorMessage.slice(3))
      process.exit(0)
    }
    if (isCancel(confirmed)) {
      cancel('Operation cancelled.')
      process.exit(0)
    }
  }
  return { fundingWallet, fundBalance }
}
