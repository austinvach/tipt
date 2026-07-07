import { charge as charge_ } from './Charge.js'
import { sparkCharge as sparkCharge_ } from './SparkCharge.js'

export function spark(parameters: spark.Parameters): ReturnType<typeof charge_> {
  return spark.charge(parameters)
}

export namespace spark {
  export type Parameters = charge_.Parameters
  export type SparkParameters = sparkCharge_.Parameters
  export const charge = charge_
  export const spark = sparkCharge_
}
