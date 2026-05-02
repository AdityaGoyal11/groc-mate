import { Command } from 'commander'
import { searchCommand } from './commands/search.js'
import { compareCommand } from './commands/compare.js'
import { listCommand } from './commands/list.js'
import { cartCommand } from './commands/cart.js'
import { planCommand } from './commands/plan.js'
import { storesCommand } from './commands/stores.js'
import { configCommand } from './commands/config.js'

const program = new Command()

program
  .name('groc')
  .description('Search, compare, and auto-fill grocery carts across Australian supermarkets')
  .version('0.1.0')

program.addCommand(searchCommand())
program.addCommand(compareCommand())
program.addCommand(listCommand())
program.addCommand(cartCommand())
program.addCommand(planCommand())
program.addCommand(storesCommand())
program.addCommand(configCommand())

program.parse()
