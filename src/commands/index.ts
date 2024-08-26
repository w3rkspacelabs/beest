import { Command } from 'src/command'
import { RunBeeNode } from './run-bee-node'
import { Status } from './status'
import { DrainAllFunds } from './drain-all-funds'
import { DeleteBees } from './delete-bees'

export const commands: Command[] = [new RunBeeNode, new Status, new DrainAllFunds, new DeleteBees]
