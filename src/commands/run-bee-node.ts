import { Command } from '../command'
import { select, text, confirm, isCancel, cancel } from '@clack/prompts'
import { ask, console_log, delay, getRPC, mkdirp, printBeeProcesses, printStartupSetup } from '../utils'
import {
  freeBeePorts,
  newBeeId,
  beeDataDir,
  padBeeId,
  getConfig,
  putConfig,
  KEY,
  ETHERPROXY_PORTS,
  ETHERPROXY_URLS,
  GOODBYE,
  BEE_MODE,
  pushConfig,
  BEEST_PASSWORD_FILE,
  BEE,
  BIN_DIR,
  BEES_DIR,
  BEE_NET,
  CURRENCY,
  CHAINS,
  beestDb,
  RPCS,
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
  chainName,
} from '../web3'

export class RunBeeNode implements Command {
  command = 'run-bee-node'
  describe = 'Run a bee node'
  interactiveMode = true
  async handler(args: any) {
    const chainNetwork = await select({
      message: ask('Select network', '--network', '-n'),
      options:[
        {value:'mainnet', label:'Mainnet', hint: 'Gnosis'},
        {value:'testnet', label:'Testnet', hint: 'Sepolia'},
      ]
    })
    // console.log({chainNetwork})
    // process.exit(0);

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
    const verbosity = 'info'
    const ports = await freeBeePorts()

    const prevBees = getConfig(KEY.BEES, [])

    if (beeMode == 'ultralight') {
      await startUltraLightNode({ chainNetwork, beeId, datadir, passFile, verbosity, ports })
    } else if (beeMode == 'light') {
      await startNode({chainNetwork, beeId, datadir, passFile, verbosity, ports }, BEE_MODE.LIGHTNODE)
    } else if (beeMode == 'full') {
      await startNode({chainNetwork, beeId, datadir, passFile, verbosity, ports }, BEE_MODE.FULLNODE)
    }
    const currBees = getConfig(KEY.BEES, [])
    if (currBees.length == prevBees.length + 1) {
      const s = spinner()
      s.start('Fetching Beest processes')
      s.stop('Beest Process List:')
      await printBeeProcesses()
      s.start('Printing Beest processes')
      s.stop('Beest Service Setup: ')
      await printStartupSetup()
    }
  }
}

function makeBeeCommandFragment(chainNetwork, ports,passFile,datadir,verbosity){
  let network = '';
  if(chainNetwork == 'mainnet'){
    network = `--mainnet=true`
  }else{
    network = `--mainnet=false --network-id=10`
  }
  return [
    network,
    `--api-addr 127.0.0.1:${ports[0]}`,
    `--p2p-addr 127.0.0.1:${ports[1]}`,
    `--password-file ${passFile}`,
    `--data-dir ${datadir}`,
    `--verbosity ${verbosity}`
  ].join(' ')
}

async function startUltraLightNode({ chainNetwork, beeId, datadir, passFile, verbosity, ports }) {
  const s = spinner()
  mkdirp(datadir)
  const configFile = `${datadir}/pm2.config.js`
  let beeCmd = makeBeeCommandFragment(chainNetwork, ports,passFile,datadir,verbosity)
  // `--api-addr :${ports[0]} --p2p-addr :${ports[1]} --password-file ${passFile} --data-dir ${datadir} --verbosity ${verbosity}`
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
  s.stop(`Started Bee ultralight node at ${green(`http://localhost:${ports[0]}`)}`)
  let bee: BEE = {
    beeId,
    processName,
    port: ports[0],
    configFile: configFile,
    command,
    mode: BEE_MODE.ULTRALIGHT,
    network: chainNetwork
  }
  pushConfig(KEY.BEES, bee)
}

async function validateRpcURLs(urls: string, chainNetwork: BEE_NET) {
  let vals = urls.split(',')
  for (let i in vals) {
    let value = vals[i]
    const chainId = CHAINS[chainNetwork].chainId
    let valid = await isValidRPC(value, chainId);
    const ETHERPROXY_URL = ETHERPROXY_URLS[chainNetwork];
    if (valid && value != ETHERPROXY_URL) {
      // do nothing
    } else {
      return red(
        `Invalid value: "${value}". Please provide a valid ${chainName(chainNetwork)} endpoint (from getblock.io, alchemy.com, other providers or your own)`,
      )
    }
  }
}

async function promptRPC(chainNetwork:BEE_NET) {
  const oldRPC = getRPC(chainNetwork)
  // console.log({oldRPC})
  const chainRpc = await text({
    message: ask(`${chainName(chainNetwork)} RPC Endpoints (one or more comma separated URLs)`, '--rpc', '-r'),
    placeholder: oldRPC,
    initialValue: oldRPC,
    validate(values) {
      if (values.trim() == '') {
        return red(
          `Please provide a valid ${chainName(chainNetwork)} endpoint (from getblock.io, alchemy.com, other providers or your own)`,
        )
      }
      let vals = values.split(',')
      for (let i in vals) {
        let value = vals[i]
        const ETHERPROXY_URL = ETHERPROXY_URLS[chainNetwork]
        if (value == ETHERPROXY_URL) {
          return red(
            `Invalid target: "${value}". Please provide a valid ${chainName(chainNetwork)} endpoint (from getblock.io, alchemy.com, other providers or your own)`,
          )
        }
      }
    },
  })

  if (isCancel(chainRpc)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  const s = spinner()
  const newRPC = chainRpc.toString().trim()
  if (oldRPC != newRPC) {
    s.start(`Testing ${chainName(chainNetwork)} RPC endpoints: "${newRPC}"`)
    const errMsg = await validateRpcURLs(newRPC,chainNetwork)
    if (errMsg) {
      s.stop(errMsg)
      return await promptRPC(chainNetwork)
    } else {
      s.stop(green(`${chainName(chainNetwork)} RPC endpoints "${newRPC}" accepted!`))
      return { oldRPC, newRPC }
    }
  }
  return { oldRPC, newRPC }
}



async function startNode({chainNetwork, beeId, datadir, passFile, verbosity, ports }, mode: BEE_MODE) {
  mkdirp(datadir)
  const curr = CURRENCY[chainNetwork]
  const configFile = `${datadir}/pm2.config.js`
  let beeCmd = makeBeeCommandFragment(chainNetwork, ports,passFile,datadir,verbosity)
  // `--api-addr :${ports[0]} --p2p-addr :${ports[1]} --password-file ${passFile} --data-dir ${datadir} --verbosity ${verbosity}`
  const s = spinner()
  const { oldRPC, newRPC } = await promptRPC(chainNetwork)

  await startEtherproxyIfNeeded(chainNetwork,oldRPC, newRPC, s)

  const CURRENCY_MIN = '0.01'
  const minCurrency = makeDai(CURRENCY_MIN)
  // s.start(`Check Funding Wallet`)
  const { fundingWallet, fundBalance } = await ensureFundingWalletHasMinimumFunds(chainNetwork,'0.011')
  s.stop(`Funding Wallet ${fundingWallet} has ${toDai(fundBalance)} ${curr}`)

  let processName = `bee-${padBeeId(beeId)}-${ports[0]}`
  const ETHERPROXY_URL = ETHERPROXY_URLS[chainNetwork]
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

  s.start(`Initialising the Bee ${mode} node`)
  await $`${BIN_DIR}/bee init --api-addr :${ports[0]} --p2p-addr :${ports[1]} --password-file ${passFile} --data-dir ${datadir}`
  const addr = getAddressFromBeeDataDirectory(datadir)
  s.stop(`Bee ${mode} node initialised. Node wallet address: ${green(`0x${addr}`)}`)
  try {
    s.start(
      `Funding bee ${mode} node with ${curr}. Sending ${toDai(minCurrency)} ${curr} from the Beest funding wallet ${fundingWallet} (${toDai(fundBalance)} ${curr}) .`,
    )
    const res = await sendNativeTransaction(chainNetwork,getConfig(KEY.FUNDING_WALLET_PK, ''), `0x${addr}`, minCurrency)
    s.stop(`Bee ${mode} node funded with ${green(toDai(minCurrency))} ${curr}. Transaction Hash: ${green(res.transaction.hash)}`)
  } catch (err) {
    console.log({ err })
    await $`rm -rf ${datadir}`
    process.exit(0)
  }

  s.start(`Starting Bee ${mode} node`)
  let command = `pm2 start --time --name ${beeId}-${ports[0]} -s ${configFile}`
  const out1 = (await $`pm2 start --time --name ${beeId}-${ports[0]} -s ${configFile}`).stdout
  s.stop(
    `Started Bee ${mode} node at ${green(`http://localhost:${ports[0]}`)}. Type ${green(`"pm2 log ${processName}"`)} to check the bee logs.`,
  )
  let bee: BEE = {
    beeId,
    processName,
    port: ports[0],
    configFile: configFile,
    command,
    mode,
    network: chainNetwork
  }
  pushConfig(KEY.BEES, bee)
}

async function startEtherproxyIfNeeded(chainNetwork:BEE_NET,oldRPC, newRPC, s) {
  // const s = spinner()
  if (newRPC != '') {
    putConfig( RPCS[chainNetwork], newRPC)
  }
  const etherproxyRunning = await isEtherproxyRunning(chainNetwork)
  const etherproxyReachable = await isEtherproxyReachable(chainNetwork)
  const shouldStartEtherproxy = !(oldRPC == newRPC && etherproxyRunning && etherproxyReachable)
  const ETHERPROXY_PORT = ETHERPROXY_PORTS[chainNetwork] 
  const ETHERPROXY_URL = ETHERPROXY_URLS[chainNetwork]
  if (shouldStartEtherproxy) {
    s.start(`Starting etherproxy (${chainName(chainNetwork)})`)
    const out = await startEtherproxy(ETHERPROXY_PORT, newRPC)
    await delay(5 * 1000) // FIXME temp fix for ECONNREFUSED error
    
    s.stop(`Etherproxy (${chainName(chainNetwork)}) started at ${green(ETHERPROXY_URL)} with target(s): ${green(newRPC)}`)
  } else {
    s.start('Checking for Etherproxy (${chainName(chainNetwork)})')
    s.stop(`Etherproxy running at ${green(ETHERPROXY_URL)} with target(s): ${green(newRPC)}`)
  }
}

async function ensureFundingWalletHasMinimumFunds(chainNetwork:BEE_NET, minimumCurrency: string = '0.011') {
  const curr = CURRENCY[chainNetwork]
  const s = spinner()
  let fundingWallet = getConfig(KEY.FUNDING_WALLET, '')
  if (fundingWallet != '') {
  } else {
    s.start('Beest funding wallet not found. Creating a new one')
    fundingWallet = createFundingWallet()
    s.stop(`Beest funding wallet created. Address: ${fundingWallet}`)
  }
  let fundBalance = await getNativeBalance(chainNetwork,fundingWallet)

  const minCurrencyValue = makeDai(minimumCurrency)
  while (isLessThan(fundBalance, minCurrencyValue)) {
    const confirmed = await confirm({
      message: `Have you funded the Beest funding wallet at ${fundingWallet} with atleast ${minimumCurrency} ${curr} per ${chainNetwork} bee node?`,
    })
    const errorMessage = `|  Beest funding wallet must have atleast ${minimumCurrency} ${curr} to start a ${chainNetwork} light node or a full node.`
    if (confirmed) {
      fundBalance = await getNativeBalance(chainNetwork,fundingWallet)
      if (isLessThan(fundBalance, minCurrencyValue)) {
        console.log(red(`${errorMessage} Beest funding wallet balance: ${toDai(fundBalance)}  ${curr}.`))
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
