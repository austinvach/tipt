export { Mppx, spark, charge } from './client/index.js';
export {
  createExtensionClient,
  createExtensionWallet,
  probeExtension,
  restoreFetch,
  type CreateExtensionClientOptions,
  type CreateExtensionWalletOptions,
  type ProbeExtensionOptions,
} from './extension.js';

export {
  DEFAULT_REQUESTED_INTENTS,
  DEFAULT_REQUESTED_PAYMENT_METHODS,
  MPP_EVENT_BRIDGE_PROTOCOL_VERSION,
  MPP_EXTENSION_EVENT,
  MPP_WALLET_RPC_EVENT,
  MPP_WALLET_RPC_RESPONSE_EVENT,
  buildMppProbeRequestDetail,
  type MppProbeRequestDetail,
  type MppResponseDetail,
  type MppWalletRpcMethod,
  type MppWalletRpcRequestDetail,
  type MppWalletRpcResponseDetail,
} from './event-bridge';
