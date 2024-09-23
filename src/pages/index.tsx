import { useState } from "react";
import localFont from "next/font/local";

import { RpcProvider, constants, ec, stark, Abi, Contract, num, uint256 } from "starknet";
// import Erc20Abi from "../abi/ERC20.json"
import UsernameStoreAbi from "../abi/UsernameStore.json"
import { connect } from "starknetkit";
import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import { SessionParams, createSessionRequest, openSession, DappKey, buildSessionAccount } from "@argent/x-sessions";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});


interface BigDecimal {
  value: bigint
  decimals: number
}


// const CHAIN_ID = constants.NetworkName.SN_SEPOLIA;
const NODE_URL = "https://starknet-sepolia.public.blastapi.io/rpc/v0_7";
const STARKNET_CHAIN_ID = constants.StarknetChainId.SN_SEPOLIA
const provider = new RpcProvider({
  nodeUrl: NODE_URL,
  chainId: STARKNET_CHAIN_ID,
})

const parseUnits = (value: string, decimals: number): BigDecimal => {
  let [integer, fraction = ""] = value.split(".")

  const negative = integer.startsWith("-")
  if (negative) {
    integer = integer.slice(1)
  }

  // If the fraction is longer than allowed, round it off
  if (fraction.length > decimals) {
    const unitIndex = decimals
    const unit = Number(fraction[unitIndex])

    if (unit >= 5) {
      const fractionBigInt = BigInt(fraction.slice(0, decimals)) + BigInt(1)
      fraction = fractionBigInt.toString().padStart(decimals, "0")
    } else {
      fraction = fraction.slice(0, decimals)
    }
  } else {
    fraction = fraction.padEnd(decimals, "0")
  }

  const parsedValue = BigInt(`${negative ? "-" : ""}${integer}${fraction}`)

  return {
    value: parsedValue,
    decimals,
  }
}
const getUint256CalldataFromBN = (bn: num.BigNumberish) =>
  uint256.bnToUint256(bn)

const parseInputAmountToUint256 = (
  input: string,
  decimals: number = 18,
) => getUint256CalldataFromBN(parseUnits(input, decimals).value)

const ETHTokenAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const UsernameStoreAddress = "0x051cf8214d781f5ee503cb668505e58f0374bfd602145560ba1b897eb98f2e1a";
const ETHFees = [
  {
    tokenAddress: ETHTokenAddress,
    maxAmount: parseUnits("0.1", 18).value.toString(),
  }
]
const allowedMethods = [
  // {
  //   "Contract Address": ETHTokenAddress,
  //   selector: "transfer"
  // }
  {
      "Contract Address": UsernameStoreAddress,
      selector: "claim_username"
  }
]
const expiry = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000) as any
const metaData = () => ({
  projectID: "test-dapp",
  txFees: ETHFees,
})

const privateKey = ec.starkCurve.utils.randomPrivateKey()
const dappKey: DappKey = {
  privateKey,
  publicKey: ec.starkCurve.getStarkKey(privateKey),
}

export default function Home() {
  const [connection, setConnection] = useState<any>(null);
  const [connectorData, setConnectorData] = useState<any>(null);
  const [address, setAddress] = useState<any>(null);

  const [sessionRequest, setSessionRequest] = useState<any>(null);
  const [accountSessionSignature, setAccountSessionSignature] = useState<any>(null);

  const connectWallet = async () => {
    const { wallet, connectorData } = await connect({
      connectors: [
          new InjectedConnector({ options: { id: "argentX" } }),
          new InjectedConnector({ options: { id: "braavos" } }),
          new WebWalletConnector({ url: process.env.NEXT_PUBLIC_ARGENT_WEBWALLET_URL }),
      ]
    })
    if (wallet && connectorData) {
        setConnection(wallet);
        setConnectorData(connectorData);
        setAddress(connectorData.account);
    }
  }

  const startSession = async () => {
      console.log('Starting session');
      console.log('Connection:', connection);
      console.log('Address:', address);
      const sessionParams: SessionParams = {
        allowedMethods,
        expiry,
        metaData: metaData(),
        publicDappKey: dappKey.publicKey,
      }
      const accountSessionSignature = await openSession({
        chainId: await provider.getChainId(),
        wallet: connection,
        sessionParams,
      })
      const sessionRequest = createSessionRequest(
        allowedMethods,
        expiry,
        metaData(),
        dappKey.publicKey,
      )
      setSessionRequest(sessionRequest)
      setAccountSessionSignature(accountSessionSignature)
  }

  const sendTest = async () => {
      console.log('Sending test');
      if (!accountSessionSignature || !sessionRequest) {
          throw new Error('Session not started');
      }
      if (!connectorData || !connectorData.account) {
        throw new Error("No connector data")
      }
      // this could be stored instead of creating each time
      const sessionAccount = await buildSessionAccount({
        accountSessionSignature: stark.formatSignature(accountSessionSignature),
        sessionRequest,
        provider: provider as any, // TODO: remove after starknetjs update to 6.9.0
        chainId: await provider.getChainId(),
        address: connectorData.account,
        dappKey,
        argentSessionServiceBaseUrl: process.env.NEXT_PUBLIC_SESSION_SERVICE_BASE_URL,
      })
      // const erc20Contract = new Contract(
      //   Erc20Abi as Abi,
      //   ETHTokenAddress,
      //   sessionAccount as any,
      // )
      const usernameStoreContract = new Contract(
          UsernameStoreAbi as Abi,
          UsernameStoreAddress,
          sessionAccount as any
      )

      // https://www.starknetjs.com/docs/guides/use_erc20/#interact-with-an-erc20
      // check .populate
      //const transferCallData = erc20Contract.populate("transfer", {
      //  recipient: connectorData.account,
      //  amount: parseInputAmountToUint256("0.001"),
      //})
      const claimUsernameCallData = usernameStoreContract.populate("claim_username", {
          key: "test-name"
      })

      // https://www.starknetjs.com/docs/guides/estimate_fees/#estimateinvokefee
      //const { suggestedMaxFee } = await sessionAccount.estimateInvokeFee({
      //  contractAddress: ETHTokenAddress,
      //  entrypoint: "transfer",
      //  calldata: transferCallData.calldata,
      //})
      const { suggestedMaxFee } = await sessionAccount.estimateInvokeFee({
          contractAddress: UsernameStoreAddress,
          entrypoint: "claim_username",
          calldata: claimUsernameCallData.calldata
      })

      // https://www.starknetjs.com/docs/guides/estimate_fees/#fee-limitation
      const maxFee = (suggestedMaxFee * BigInt(15)) / BigInt(10)
      // send to same account
      //const result = await erc20Contract.transfer(transferCallData.calldata, {
      //  maxFee,
      //})
      const result = await usernameStoreContract.claim_username(claimUsernameCallData.calldata, {
          maxFee
      })
      console.log(result.transaction_hash);
  }

  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]`}
    >
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <button
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            rel="noopener noreferrer"
            onClick={connectWallet}
          >
            Connect wallet
          </button>
          <button
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            rel="noopener noreferrer"
            onClick={startSession}
          >
            Start session
          </button>
          <button
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44"
            rel="noopener noreferrer"
            onClick={sendTest}
          >
            Send test
          </button>
        </div>
      </main>
    </div>
  );
}
