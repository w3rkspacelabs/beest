import { gray, green, red } from 'picocolors'
import crypto from "crypto";
import { $, fs, which, fetch, ProcessOutput } from 'zx';
import { BEES_DIR, BEE_NET, KEY, RPCS, RPC_DEFAULT, getConfig, putConfig } from './config';
import { spinner } from '@clack/prompts';
import Table from 'cli-tableau'

export const ask = (message: string, key: string, alias: String) => {
    return `${message}: ${gray(`(${key}, ${alias})`)}`
}

export const generatePassword = (length = 16) => {
    const Allowed = {
        Uppers: "QWERTYUIOPASDFGHJKLZXCVBNM",
        Lowers: "qwertyuiopasdfghjklzxcvbnm",
        Numbers: "1234567890",
        Symbols: "!@#$%^&*"
    }
    const getRandomCharFromString = (str: string) => str.charAt(Math.floor(crypto.randomInt(0, str.length)))
    let pwd = "";
    pwd += getRandomCharFromString(Allowed.Uppers);  // pwd will have at least one upper
    pwd += getRandomCharFromString(Allowed.Lowers);  // pwd will have at least one lower
    pwd += getRandomCharFromString(Allowed.Numbers);  // pwd will have at least one number
    pwd += getRandomCharFromString(Allowed.Symbols); // pwd will have at least one symbol
    for (let i = pwd.length; i < length; i++)
        pwd += getRandomCharFromString(Object.values(Allowed).join(''));  // fill the rest of the pwd with random characters
    return pwd
}

export const mkdirp = (dirpath: string) => {
    if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath)
    }
}

export const rmDir = (dirpath: string) => {
    if (fs.existsSync(dirpath)) {
        fs.rmSync(dirpath, { recursive: true, force: true })
    }
    mkdirp(dirpath);
}


export const systemCommandExists = async (cmd: string) => {
    try {
        await which(cmd)
    } catch (err) {
        return false;
    }
    return true
}

export const ensureGlobalNpmCommandExists = async (cmd: string, packageName: string = '') => {
    try {
        const cmdExists = await systemCommandExists(cmd)
        if (cmdExists) {
            return true;
        }
    } catch (err) {
        throw err;
    }
    const s = spinner()
    s.start(`Command ${cmd} not found. Installing via npm`);
    let pkg = packageName == '' ? cmd : packageName
    try {
        const { stdout, stderr } = (await $`npm i -g ${pkg}`)
    } catch (err) {
        checkForInstallPermissionError(err, pkg)
    }
    s.stop(`Installed ${cmd}${packageName == '' ? '' : ` (${packageName})`} via npm`);
}

export const checkForInstallPermissionError = (err, pkg: string) => {
    const errMsg = (err as ProcessOutput).stderr
    if (errMsg.includes('EACCES') && errMsg.includes('permission denied')) {
        console.log(red(
            [`ERROR: Cannot install ${pkg} due to insuffcicient permission. To fix this:`,
                `1. Uninstall and purge 'nodejs' package`,
                `2. and reinstall 'node' using 'nvm'`,
                `- https://github.com/rampall/beest/blob/main/README.md`].join("\n ")))
        process.exit(0)
    }
}

export const delay = (millisec: number) => {
    return new Promise(resolve => {
        setTimeout(() => { resolve('') }, millisec);
    })
}

export function listFolders(dirPath: string) {
    return fs.readdirSync(dirPath)
}


export function getRPC(chainNetwork:BEE_NET) {
    return getConfig( RPCS[chainNetwork] , RPC_DEFAULT[chainNetwork])
}

export function console_log(str: string) {
    console.log('│  ' + str.split("\n").join("\n│  "))
}

export const fetchURL = async (url: string) => {
    console.log({ url })
    try {
        const response = await fetch(url);
        console.log({ response })
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log({ data });
        return data;
    } catch (error) {
        console.error('Error fetching the status:', error);
    }
};

export function getBool(bool: boolean) {
    return bool ? green('YES') : red('NO')
}

export function printMessageBox(title: string, msg: string) {
    const table = new Table({
        head: [title],
        colAligns: ['left'],
        style: { 'padding-left': 1, head: ['cyan', 'bold'], compact: true },
    })
    table.push([msg]);
    console_log(table.toString().trim())
}

export const printStartupSetup = async () => {
    await saveAllProcesses()
    let title = 'STARTUP: To start Bees Automatically upon Reboot. You only need to run this once.'
    const fixMessage = (msg: string) => {
        return msg.replace(' PATH=$PATH:', ' "PATH=$PATH":').replace(/\[PM2\] /g, '')
    }
    try {
        let msg = (await $`pm2 startup`).stdout
        if (msg.includes(' PATH=$PATH:')) {
            printMessageBox(title, fixMessage(msg))
        }
    } catch (err) {
        let msg = err.stdout;
        if (msg.includes(' PATH=$PATH:')) {
            printMessageBox(title, fixMessage(msg))
        }
    }
}

export async function getProcList() {
    const procs = (await $`pm2 jlist`).json()
    const sortedProcs = procs.sort((a, b) => b.pm_id > a.pm_id)
    return sortedProcs;
}

export async function getBeeProcesses() {
    let result = []
    let bees = getConfig(KEY.BEES, [])
    const _bees = bees.filter(bee => fs.existsSync(bee.configFile))
    if (bees.length > _bees.length) {
        bees = _bees;
        putConfig(KEY.BEES, bees)
    }
    const sortedProcs = await getProcList()
    for (let i in sortedProcs) {
        let mode = ''
        let network = ''
        let { name, pm_id, pm2_env } = sortedProcs[i]

        let status = pm2_env.status
        if (name.split('-')[0] == 'etherproxy') {
            //TODO
        } else {
            let bee = bees.find((val) => val.processName == name)
            if (bee) {
                mode = bee.mode
                network = bee.network
                let apiURL = `Status: ${status}`;
                if (status == 'online') {
                    apiURL = `http://localhost:${bee.port}`
                }
                result.push({ pm_id, name, network, mode, status, port: bee.port })
            } else {
                try {
                    await $`pm2 delete ${pm_id}`;
                    await saveAllProcesses();
                } catch (err) {
                    throw err;
                }
            }
        }
    }
    return result;
}

export async function saveAllProcesses(){
    return $`pm2 save -s --force`;
}

export const printBeeProcesses = async () => {
    const bees = await getBeeProcesses()
    const table = new Table({
        head: ['id', 'name', 'network', 'mode', 'process', 'API endpoint', 'logs', 'start|stop', 'datadir'],
        colAligns: ['left'],
        style: { 'padding-left': 1, head: ['cyan', 'bold'], compact: true },
    })
    for (let i in bees) {
        const bee = bees[i]
        const { pm_id, name, network, mode, status, port, datadir } = bee
        let apiURL = `Status: ${status}`;
        if (status == 'online') {
            apiURL = `http://localhost:${port}`
        }
        let online = status == 'online'
        table.push([pm_id, name, network, mode, online ? green(status) : red(status), apiURL, `pm2 log ${pm_id}`, online ? `pm2 stop ${pm_id}` : `pm2 start ${pm_id}`, `${BEES_DIR}/${name.split('-').slice(0,-1).join('-')}` ])
    }
    if (table.length < 1) {
        console_log(red(`No bees found`))
    } else {
        console_log(table.toString())
    }
}
