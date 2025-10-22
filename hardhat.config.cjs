require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,  // Higher runs = smaller bytecode
      },
      viaIR: true,
    },
  },
  networks: {
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY 
        ? [process.env.DEPLOYER_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY]
        : [],
      chainId: 8453,
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC || process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: process.env.DEPLOYER_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY 
        ? [process.env.DEPLOYER_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY]
        : [],
      chainId: 42161,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
