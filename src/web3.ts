import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import {
  BEES_DIR,
  BEEST_DIR,
  KEY,
  getConfig,
  putConfig,
  ETHERPROXY_URLS,
  ETHERPROXY_PORTS,
  RPC_DEFAULT,
  BEE_NET,
  CURRENCY,
  CHAINS,
  RPCS,
  ETHERPROXIES,
  TX_FEE,
} from './config'
import Big from 'big.js'
import { fs, fetch, $, os } from 'zx'
import { listFolders, saveAllProcesses } from './utils'
import { Network } from 'ethers'
import { read } from 'fs'
import { red } from 'picocolors'
import { spinner } from '@clack/prompts'
const BZZ_CONTRACTS = {
  mainnet: '0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da',
  testnet: '0x543dDb01Ba47acB11de34891cD86B675F04840db'
}
const ABI = {
  uniswap: [
    {
      inputs: [
        {
          internalType: 'uint256',
          name: 'amountOutMin',
          type: 'uint256',
        },
        {
          internalType: 'address[]',
          name: 'path',
          type: 'address[]',
        },
        {
          internalType: 'address',
          name: 'to',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'deadline',
          type: 'uint256',
        },
      ],
      name: 'swapExactETHForTokens',
      outputs: [
        {
          internalType: 'uint256[]',
          name: 'amounts',
          type: 'uint256[]',
        },
      ],
      stateMutability: 'payable',
      type: 'function',
    },
  ],
  bzz: [
    {
      type: 'function',
      stateMutability: 'nonpayable',
      payable: false,
      outputs: [
        {
          type: 'bool',
          name: '',
        },
      ],
      name: 'transfer',
      inputs: [
        {
          type: 'address',
          name: '_to',
        },
        {
          type: 'uint256',
          name: '_value',
        },
      ],
      constant: false,
    },
    {
      constant: true,
      inputs: [
        {
          name: '_owner',
          type: 'address',
        },
      ],
      name: 'balanceOf',
      outputs: [
        {
          name: 'balance',
          type: 'uint256',
        },
      ],
      payable: false,
      type: 'function',
    },
  ],
}

async function getPrivateKeyFromKeystore(keystorePath, password) {
  // Read the keystore file
  const keystoreJson = fs.readFileSync(keystorePath, 'utf8');

  try {
    // Decrypt the keystore file to get the wallet
    const wallet = await Wallet.fromEncryptedJson(keystoreJson, password);

    // Extract the private key from the wallet
    const privateKey = wallet.privateKey;
    return privateKey;
  } catch (error) {
    console.error("Error decrypting keystore:", error);
    throw error;
  }
}

export const createFundingWallet = () => {
  let walletAddress = getConfig(KEY.FUNDING_WALLET, '')
  if (walletAddress != '') {
    // console.log(getConfig(KEY.FUNDING_WALLET, ''))
    // console.log(getConfig(KEY.FUNDING_WALLET_PK, ''))
    return walletAddress
  }
  let w = Wallet.createRandom()
  putConfig(KEY.FUNDING_WALLET, w.address)
  putConfig(KEY.FUNDING_WALLET_PK, w.privateKey)
  return w.address
}

export async function isEtherproxyReachable(chainNetwork:BEE_NET,etherproxyURL: string = '') {
  if (etherproxyURL == '') {
    etherproxyURL = ETHERPROXY_URLS[chainNetwork]
  }
  const requestBody = {
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    id: 1,
  }
  try {
    const response = await fetch(etherproxyURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) {
      return false
    }
  } catch (err) {
    return false
  }
  return true
}

export const getRPC = async (chainNetwork:BEE_NET,useProxy = false) => {
  let GNOSIS_RPC = getConfig( RPCS[chainNetwork], RPC_DEFAULT[chainNetwork])
  if (!useProxy) {
    return GNOSIS_RPC
  }
  const eproxy = await isEtherproxyRunning(chainNetwork)
  if (eproxy) {
    return ETHERPROXY_URLS[chainNetwork]
  } else {
    return GNOSIS_RPC
  }
}

async function makeReadyProvider(chainNetwork:BEE_NET, useProxy = false) {
  const network = new Network( CHAINS[chainNetwork].name , CHAINS[chainNetwork].chainId)
  const rpc = await getRPC(chainNetwork,useProxy)
  const provider = new JsonRpcProvider(rpc, network, { staticNetwork: network })
  await provider.ready
  return provider
}

export async function isEtherproxyRunning(chainNetwork:BEE_NET) {
  const pid = (await $`pm2 pid etherproxy-${ETHERPROXY_PORTS[chainNetwork]}`).stdout.trim()
  return pid != '' && pid != '0'
}

export async function startEtherproxy(chainNetwork:BEE_NET, targetRPC: string) {
  const port = ETHERPROXY_PORTS[chainNetwork] 
  
  const conf = `${BEEST_DIR}/${chainNetwork}-etherproxy-${port}-pm2.config.js`
  fs.writeFileSync(
    conf,
    `module.exports = {
              apps: [
                {
                  name: "etherproxy-${port}",
                  script: "etherproxy",
                  args: "--port ${port} --target ${targetRPC} --expiry 2000",
                  watch: false,
                  autorestart:false,
                  namespace: 'beest'
                },
              ],
            };`,
  )

  let command = `pm2 start --name etherproxy-${port} ${conf} --time`
  let name = `etherproxy-${port} ${conf}`
  putConfig(ETHERPROXIES[chainNetwork], { command, name })
  const out = (await $`pm2 start --name ${name} ${conf} --time`).stdout
  await saveAllProcesses()
  return out
}

async function makeReadySigner(chainNetwork:BEE_NET,privateKey: string) {
  // console.log({chainNetwork,privateKey})
  const provider = await makeReadyProvider(chainNetwork)
  const signer = new Wallet(privateKey, provider)
  return { signer, provider }
}

export function pad0x(address: string) {
  return address.startsWith('0x') ? address : `0x${address}`
}

export async function getNativeBalance(chainNetwork:BEE_NET,address: string) {
  let addr = pad0x(address)
  const provider = await makeReadyProvider(chainNetwork)
  const bigNumberBalance = await provider.getBalance(addr)
  return bigNumberBalance.toString()
}

export async function getBzzBalance(chainNetwork:BEE_NET,address: string) {
  const provider = await makeReadyProvider(chainNetwork)
  const bzz = new Contract(BZZ_CONTRACTS[chainNetwork], ABI.bzz, provider)
  if (bzz && bzz.balanceOf) {
    const bigNumberBalance = await bzz.balanceOf(address)
    return bigNumberBalance.toString()
  }
  return 0
}

export function makeBzz(decimalString: string) {
  return new Big(decimalString).mul(new Big(10).pow(16)).toString()
}

export function makeDai(decimalString: string) {
  return new Big(decimalString).mul(new Big(10).pow(18)).toString()
}

export function toBzz(bigNumberString: string) {
  return new Big(bigNumberString).div(new Big(10).pow(16)).toString()
}

// Reverse of makeDai: Convert a big number string to a decimal string for DAI (18 decimal places)
export function toDai(bigNumberString: string, fixed: number = 4) {
  return new Big(bigNumberString).div(new Big(10).pow(18)).toFixed(fixed).replace(/0+$/, '0')
}

export async function sendNativeTransaction(chainNetwork:BEE_NET, privateKey: string, to: string, value: string) {
  const { signer, provider } = await makeReadySigner(chainNetwork,privateKey)
  // const feeData = await provider.getFeeData()
  try {
    const amount = await getMaxTransferableAmount(value, provider)
    // const gasPrice = await (await signer.getFeeData()).gasPrice
    const transaction = await signer.sendTransaction({ to, value: amount })
    const receipt = await transaction.wait(1)
    return { transaction, receipt }
  } catch (err) {
    console.log(err.error.message)
  }
}

export async function sendBzzTransaction(chainNetwork:BEE_NET,privateKey: string, to: string, value: string) {
  const { signer, provider } = await makeReadySigner(chainNetwork,privateKey)
  // const gasPrice = await signer.getGasPrice()
  const bzz = new Contract(BZZ_CONTRACTS[chainNetwork], ABI.bzz, signer)
  if (bzz.transfer) {
    const transaction = await bzz.transfer(to, value)
    const receipt = await transaction.wait(1)
    return { transaction, receipt }
  }
}

export const isLessThan = (bigX: string, bigY: string) => {
  return new Big(bigX).lt(new Big(bigY))
}

export const isGreaterThan = (bigX: string, bigY: string) => {
  return new Big(bigX).gt(new Big(bigY))
}


export async function getMaxTransferableAmount(amount, provider: JsonRpcProvider) {
  const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData()
  const fees = new Big('21000').mul(new Big(maxFeePerGas.toString()))
  const maxTransferable = new Big(amount).sub(fees)
  // console.log({ gasPrice, maxFeePerGas, maxPriorityFeePerGas, amount, fees:fees.toString(), maxTransferable:maxTransferable.toString() })
  return maxTransferable.toString()
}

function hexToDecimal(hexString: string): number {
  return parseInt(hexString, 16)
}

function decimalToHex(decimalNumber: number): string {
  return `0x${decimalNumber.toString(16)}`
}

const GNOSIS_CHAINID = 100

export async function isValidRPC(rpcURL, chainId: number) {
  const requestBody = {
    jsonrpc: '2.0',
    method: 'eth_chainId',
    params: [],
    id: 1,
  }
  try {
    const response = await fetch(rpcURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) {
      return false
    } else {
      const data = (await response.json()) as { result: string }

      if (data.result == decimalToHex(chainId)) {
        // console.log({rpcURL,data,chainId});
        return true
      } else {
        // process.exit(0)
        console.log({ rpcURL, data,chainId })
        return false
      }
    }
  } catch (err) {
    return false
  }
  return true
}

export function chainName(chainNetwork){
  return chainNetwork == 'mainnet' ? 'Gnosis' : 'Sepolia'
}

export async function drainTo(chainNetwork:BEE_NET, toAddress: string, fromV3WalletFilePath = '') {
  const FEE_SAFE_SUB_VALUE = makeDai(TX_FEE[chainNetwork])
  const wallet = new Wallet(getConfig(KEY.FUNDING_WALLET_PK, ''))
  const addr = wallet.address
  const balance = await getNativeBalance(chainNetwork,addr)
  const curr = CURRENCY[chainNetwork]
  if (isGreaterThan(balance, FEE_SAFE_SUB_VALUE)) {
    const provider = await makeReadyProvider(chainNetwork)
    const feeData = await provider.getFeeData()
    const walletConnected = wallet.connect(provider)
    try {
      const value = new Big(balance).sub(FEE_SAFE_SUB_VALUE).toString()
      const transaction = await walletConnected.sendTransaction({ gasLimit: 21000, to: toAddress, value })
      const receipt = await transaction.wait(1)
      return `Funding Wallet ${addr} has ${toDai(balance)} ${curr}. Drained ${toDai(value)} ${curr}`
    } catch (err) {
      let msg = err.error.message
      // console.log(err)
      if (msg.startsWith('InsufficientFunds, Balance is')) {
        const values = msg.split(' ')
        const balance = Big(values[3])
        const cost = Big(values[10])
        const short = cost.sub(balance)
        // console.log({ balance:balance.toString(), cost:cost.toString(), short:short.toString() })
        const value = new Big(balance).sub(FEE_SAFE_SUB_VALUE).sub(short).toString()
        const transaction = await walletConnected.sendTransaction({ gasLimit: 21000, to: toAddress, value })
        const receipt = await transaction.wait(1)
        const prefix = fromV3WalletFilePath != '' ? `Wallet ${fromV3WalletFilePath}` : `Funding Wallet ${addr}`
        return `${prefix} has ${toDai(balance.toString())} ${curr}. Drained ${toDai(value)} ${curr}!`
      }
      return 'TODO: Retry Tx with lower value'
    }
  } else {
    if (balance == '0') {
      return `Funding Wallet has no ${curr}. Skipping.`
    }
    return `Funding Wallet has ${toDai(balance)} ${curr}. Funds too low. Skipping.`
  }
}

export async function drainCurrency(
  chainNetwork:BEE_NET,
  v3WalletFilePath: string,
  password: string,
  toAddress: string
) {
  const curr = CURRENCY[chainNetwork]
  const FEE_SAFE_SUB_VALUE = makeDai( TX_FEE[chainNetwork] )
  const jsonString = fs.readFileSync(v3WalletFilePath, 'utf8')
  const addr = JSON.parse(jsonString)['address']
  const balance = await getNativeBalance(chainNetwork,addr)
  const beeId = v3WalletFilePath.split('/').slice(-3)[0]
  const pass = fs.readFileSync(`${BEEST_DIR}/beest.pwd`).toString().trim()
  const pk = await getPrivateKeyFromKeystore(v3WalletFilePath,pass)

  if (isGreaterThan(balance, FEE_SAFE_SUB_VALUE)) {
    // console.log(1)
    // console.log(`Wallet ${v3WalletFilePath} has ${toDai(balance)} ${curr}`)
    const wallet = await Wallet.fromEncryptedJson(jsonString, password)
    const provider = await makeReadyProvider(chainNetwork)
    const feeData = await provider.getFeeData()
    // console.log({chainNetwork,provider:provider._network.name,feeData})
    const walletConnected = wallet.connect(provider)
    const value = new Big(balance).sub(FEE_SAFE_SUB_VALUE).toString()
    const cost = (new Big(feeData.gasPrice.toString()).mul('21000')+value )
    try {
      // console.log(2)
      
      const transaction = await walletConnected.sendTransaction({ gasLimit: 21000, to: toAddress, value })
      const receipt = await transaction.wait(1)
      return `${beeId} Wallet ${toAddress} has ${toDai(balance)} ${curr}. Drained ${toDai(value)} ${curr}`
      // return { transaction, receipt }
    } catch (err) {
      console.log({balance:toDai(balance),curr,value:toDai(value),DAI_SAFE_SUB_VALUE:toDai(FEE_SAFE_SUB_VALUE),cost:toDai(cost) })
      if(err.shortMessage){
        return `${beeId} Wallet ${toAddress} (PK: ${pk}) has ${toDai(balance)} ${curr}. ${red(`${err.code}`)}`
      }
      let msg = err.error.message
      if (msg.startsWith('InsufficientFunds, Balance is')) {
        // console.log(4)
        const values = msg.split(' ')
        const balance = Big(values[3])
        const cost = Big(values[10])
        const short = cost.sub(balance)
        // console.log({ balance:balance.toString(), cost:cost.toString(), short:short.toString() })
        const value = new Big(balance).sub(FEE_SAFE_SUB_VALUE).sub(short).toString()
        if (isGreaterThan(balance.toString(), Big(FEE_SAFE_SUB_VALUE).plus(value).toString())) {
          // console.log(5)
          const transaction = await walletConnected.sendTransaction({ gasLimit: 21000, to: toAddress, value })
          const receipt = await transaction.wait(1)
          return `Wallet ${v3WalletFilePath} has ${toDai(balance.toString())} ${curr}. Drained ${toDai(value)} ${curr}`
        } else {
          return `Wallet ${v3WalletFilePath} has ${toDai(balance.toString())} ${curr}. Funds too low. Skipping.`
        }
      }
      return 'TODO: Retry Tx with lower value'
    }
  } else {
    if (balance == '0') {
      return `Wallet ${v3WalletFilePath} has no ${chainNetwork} ${curr}. Skipping.`
    }
    return `Wallet ${v3WalletFilePath} has ${toDai(balance)} ${curr}. Funds too low. Skipping.`
  }
}

export async function drainToken(
  chainNetwork:BEE_NET,
  v3WalletFilePath: string,
  password: string,
  toAddress: string
) {
  const FEE_SAFE_SUB_VALUE = makeDai(TX_FEE[chainNetwork])
  const jsonString = fs.readFileSync(v3WalletFilePath, 'utf8')
  const addr = JSON.parse(jsonString)['address']
  const balance = await getBzzBalance(addr,chainNetwork)
  if (isGreaterThan(balance, FEE_SAFE_SUB_VALUE)) {
    console.log(`${v3WalletFilePath} = ${toDai(balance)}`)
    // console.log({ to:toAddress, value:balance })
    const wallet = await Wallet.fromEncryptedJson(jsonString, password)
    const provider = await makeReadyProvider(chainNetwork)
    const signer = wallet.connect(provider)
    const bzz = new Contract(BZZ_CONTRACTS[chainNetwork], ABI.bzz, signer)
    if (bzz.transfer) {
      const transaction = await bzz.transfer(toAddress, new Big(balance).sub(FEE_SAFE_SUB_VALUE).toString())
      const receipt = await transaction.wait(1)
      return { transaction, receipt }
    }
  }
}

export function getAddressFromBeeDataDirectory(beeDataDir: string) {
  return fs.readJsonSync(`${beeDataDir}/keys/swarm.key`)['address']
}
