import type { Address } from 'abitype'

import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import { universalSignatureValidatorAbi } from '../../constants/abis.js'
import { universalSignatureValidatorByteCode } from '../../constants/contracts.js'
import { CallExecutionError } from '../../errors/contract.js'
import type { ErrorType } from '../../errors/utils.js'
import type { Chain } from '../../types/chain.js'
import type { ByteArray, Hex, Signature } from '../../types/misc.js'
import {
  type EncodeDeployDataErrorType,
  encodeDeployData,
} from '../../utils/abi/encodeDeployData.js'
import {
  type IsBytesEqualErrorType,
  isBytesEqual,
} from '../../utils/data/isBytesEqual.js'
import { type IsHexErrorType, isHex } from '../../utils/data/isHex.js'
import { type ToHexErrorType, bytesToHex } from '../../utils/encoding/toHex.js'
import { getAction } from '../../utils/getAction.js'
import { serializeSignature } from '../../utils/signature/serializeSignature.js'
import { type CallErrorType, type CallParameters, call } from './call.js'

export type VerifyHashParameters = Pick<
  CallParameters,
  'blockNumber' | 'blockTag' | 'factory' | 'factoryData'
> & {
  /** The address that signed the original message. */
  address: Address
  /** The hash to be verified. */
  hash: Hex
  /** The signature that was generated by signing the message with the address's private key. */
  signature: Hex | ByteArray | Signature
}

export type VerifyHashReturnType = boolean

export type VerifyHashErrorType =
  | CallErrorType
  | IsHexErrorType
  | ToHexErrorType
  | IsBytesEqualErrorType
  | EncodeDeployDataErrorType
  | ErrorType

/**
 * Verifies a message hash onchain using ERC-6492.
 *
 * @param client - Client to use.
 * @param parameters - {@link VerifyHashParameters}
 * @returns Whether or not the signature is valid. {@link VerifyHashReturnType}
 */
export async function verifyHash<TChain extends Chain | undefined>(
  client: Client<Transport, TChain>,
  { address, hash, signature, ...callRequest }: VerifyHashParameters,
): Promise<VerifyHashReturnType> {
  const signatureHex = (() => {
    if (isHex(signature)) return signature
    if (typeof signature === 'object' && 'r' in signature && 's' in signature)
      return serializeSignature(signature)
    return bytesToHex(signature)
  })()

  try {
    const { data } = await getAction(
      client,
      call,
      'call',
    )({
      data: encodeDeployData({
        abi: universalSignatureValidatorAbi,
        args: [address, hash, signatureHex],
        bytecode: universalSignatureValidatorByteCode,
      }),
      ...callRequest,
    } as unknown as CallParameters)

    return isBytesEqual(data ?? '0x0', '0x1')
  } catch (error) {
    if (error instanceof CallExecutionError) {
      // if the execution fails, the signature was not valid and an internal method inside of the validator reverted
      // this can happen for many reasons, for example if signer can not be recovered from the signature
      // or if the signature has no valid format
      return false
    }

    throw error
  }
}
