const RPC_URL =
  "https://go.getblock.io/2e411fe60c824a94951fddbe9e7922ea/ext/bc/C/rpc";

function weiToAvax(weiAmount) {
  try {
    if (!weiAmount || weiAmount === "0" || weiAmount === 0) {
      return "0.000000";
    }
    const weiString = weiAmount.toString();

    let wei;
    if (weiString.startsWith("0x")) {
      // Hexadecimal input
      wei = BigInteger(weiString.substring(2), 16);
    } else {
      // Decimal input
      wei = BigInteger(weiString, 10);
    }

    const avaxDecimals = Math.pow(10, 18);
    const result = (parseFloat(wei.toString()) / avaxDecimals).toFixed(6);

    console.log("Wei conversion:", weiAmount, "->", result, "AVAX");
    return result;
  } catch (error) {
    console.error("Error converting Wei to AVAX:", error, "Input:", weiAmount);
    return "0.000000";
  }
}

// Fetch balance via RPC
async function getBalanceRPC(address) {
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    };
    const resp = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await resp.json();

    if (j.error) {
      throw new Error(j.error.message);
    }

    return {
      avax: weiToAvax(j.result),
    };
  } catch (error) {
    console.error("Error fetching balance:", error);
    throw error;
  }
}

// Get transaction count (nonce)
async function getTransactionCount(address) {
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionCount",
      params: [address, "latest"],
    };
    const resp = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await resp.json();

    if (j.error) {
      throw new Error(j.error.message);
    }

    return parseInt(j.result, 16);
  } catch (error) {
    console.error("Error fetching nonce:", error);
    throw error;
  }
}

//  Get current gas price
async function getGasPrice() {
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_gasPrice",
      params: [],
    };
    const resp = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await resp.json();

    if (j.error) {
      throw new Error(j.error.message);
    }

    return j.result;
  } catch (error) {
    console.error("Error fetching gas price:", error);
    throw error;
  }
}

// Prepare transaction data for Avalanche C-Chain
async function prepareAvalancheTransaction(
  privateKey,
  recipientAddress,
  amountInAvax
) {
  try {
    // Validate inputs
    if (!privateKey || !recipientAddress || !amountInAvax) {
      throw new Error(
        "Missing required parameters: privateKey, recipientAddress, or amount"
      );
    }

    if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
      throw new Error("Invalid recipient address format");
    }

    if (parseFloat(amountInAvax) <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const wallet = await avaxCrypto.generateMultiChain(privateKey);
    privateKey = wallet.AVAX.privateKey;
    console.log(privateKey);

    if (privateKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privateKey)) {
      throw new Error(
        "Invalid private key format. Must be 64 hexadecimal characters."
      );
    }

    // Get AVAX sender address from private key (works with FLO/BTC/AVAX private keys)

    const senderAddress = wallet.AVAX.address;

    // Check sender balance
    const balance = await getBalanceRPC(senderAddress);
    if (parseFloat(balance.avax) < parseFloat(amountInAvax)) {
      throw new Error(
        `Insufficient balance. You have ${balance.avax} AVAX but trying to send ${amountInAvax} AVAX`
      );
    }

    // Get transaction count (nonce)
    const nonce = await getTransactionCount(senderAddress);

    // Get current gas price
    const gasPrice = await getGasPrice();

    // Return prepared transaction data
    return {
      senderAddress: senderAddress,
      recipientAddress: recipientAddress,
      amount: amountInAvax,
      nonce: nonce,
      gasPrice: gasPrice,
      gasLimit: 21000,
      chainId: 43114,
      balance: balance.avax,
      cleanPrivateKey: privateKey,
      rpcUrl: RPC_URL,
    };
  } catch (error) {
    console.error("Transaction preparation error:", error);
    throw new Error(`Transaction preparation failed: ${error.message}`);
  }
}

// Fetch transaction history with pagination support
async function fetchAvalancheTxHistory(address, page = 1, pageSize = 10) {
  try {
    const url = `https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${pageSize}&sort=desc`;

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== "1") {
      if (data.message === "No transactions found") {
        return { transactions: [], hasMore: false };
      }
      throw new Error(data.message || "Failed to fetch transaction history");
    }

    const transactions = data.result || [];
    const hasMore = transactions.length === pageSize;

    return {
      transactions: transactions,
      hasMore: hasMore,
    };
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    throw error;
  }
}
