import {
  Chain,
  ChainAddress,
  ChainContext,
  Network,
  Signer,
  SignAndSendSigner,
  TxHash,
  UnsignedTransaction,
  Wormhole,
} from "@wormhole-foundation/sdk-connect";
import { getEvmSignerForKey } from "@wormhole-foundation/sdk-evm";
import { getSolanaSigner } from "@wormhole-foundation/sdk-solana";
import type { Provider } from "ethers";

// Add this at the top of the file
declare global {
  var pendingTransactions: any;
}

export interface SignerContext<N extends Network, C extends Chain> {
  signer: Signer<N, C>;
  address: ChainAddress<C>;
}

// Custom EVM signer that doesn't require private key
export class EvmExternalSigner<N extends Network, C extends Chain>
  implements SignAndSendSigner<N, C>
{
  private readonly provider: Provider;
  private readonly _address: string;
  private readonly _chain: C;
  public onTransactionRequest?: (txs: UnsignedTransaction[]) => Promise<void>;

  constructor(
    chain: C,
    provider: Provider,
    address: string,
    onTransactionRequest?: (txs: UnsignedTransaction[]) => Promise<void>
  ) {
    this.provider = provider;
    this._address = address;
    this._chain = chain;
    this.onTransactionRequest = onTransactionRequest;
  }

  chain(): C {
    return this._chain;
  }

  address(): string {
    return this._address;
  }

  async signAndSend(txs: UnsignedTransaction[]): Promise<TxHash[]> {
    // Extract transaction data for external signing
    const transactionsForSigning = txs.map((tx) => {
      const evmTx = tx.transaction as any;
      return {
        from: this._address,
        to: evmTx.to,
        data: evmTx.data,
        value: evmTx.value || "0x0",
        gasLimit: evmTx.gasLimit?.toString(), // Convert BigInt to string
        gasPrice: evmTx.gasPrice?.toString(), // Convert BigInt to string
        nonce: evmTx.nonce,
        chainId: evmTx.chainId,
      };
    });

    // Notify about transactions that need external signing
    if (this.onTransactionRequest) {
      await this.onTransactionRequest(txs);
    }

    // Store the transactions somewhere for external access
    global.pendingTransactions = transactionsForSigning;

    // Use custom replacer function to handle BigInt
    const replacer = (key: string, value: any) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };

    console.log(
      "Transactions requiring signature:",
      JSON.stringify(transactionsForSigning, replacer, 2)
    );

    // Return transaction hashes with encoded data for reference
    return txs.map((_, index) => {
      const txData = transactionsForSigning[index];
      console.log("txData", txData);
      return `tx-pending-${index}-${txData.chainId}-${Date.now()}` as TxHash;
    });
  }

  // Add a static method to retrieve pending transactions
  static getPendingTransactions() {
    return global.pendingTransactions || [];
  }
}

// Modified getSigner function
export async function getSignerNew<N extends Network, C extends Chain>(
  chain: ChainContext<N, C>,
  address: string // Pass in the sender's address
): Promise<SignerContext<N, C>> {
  let signer: SignAndSendSigner<N, C>;
  const platform = chain.platform.utils()._platform;

  switch (platform) {
    case "Solana":
      // Handle Solana case
      throw new Error("Solana external signer not implemented");

    case "Evm":
      const provider = await chain.getRpc();
      signer = new EvmExternalSigner(
        chain.chain as C,
        provider,
        address
      ) as SignAndSendSigner<N, C>;
      break;

    default:
      throw new Error("Unrecognized platform: " + platform);
  }

  return {
    signer,
    address: Wormhole.chainAddress(chain.chain, signer.address()),
  };
}