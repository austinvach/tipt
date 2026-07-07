import { charge as charge_ } from './Charge.js'
import { session as session_ } from './Session.js'

export function spark(parameters: spark.Parameters): ReturnType<typeof charge_> {
  return spark.charge(parameters)
}

export namespace spark {
  export type Parameters = charge_.Parameters
  export const charge = charge_
  export const session = session_
}
