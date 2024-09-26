import { Command } from 'src/command'
import { RunBeeNode } from './run-bee-node'
import { Settings } from './settings'
import { DrainAllFunds } from './drain-all-funds'
import { DeleteBees } from './delete-bees'
import { UpgradeBee } from './upgrade-bee'

export const commands: Command[] = [
    new RunBeeNode, 
    new UpgradeBee, 
    new Settings, 
    new DrainAllFunds, 
    new DeleteBees
]
