import { charge as charge_ } from './Charge.js'

export function spark(parameters: spark.Parameters): ReturnType<typeof charge_> {
  return spark.charge(parameters)
}

export namespace spark {
  export type Parameters = charge_.Parameters
  export const charge = charge_
}
