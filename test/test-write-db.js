#!/usr/bin/env node
var utils = require('bitcoin-util')
var bitcoin = require('bitcoinjs-lib')
var level = require('level')
var params = require('webcoin-bitcoin')

var runTest = require('./run-test')

var networks = bitcoin.networks

var checkpoint = {
  height: 278208,
  header: {
    version: 2,
    prevHash: utils.toHash('0000000000000000a979bc50075e7cdf0da5274f7314910b2d798b1aeaf6543f'),
    merkleRoot: utils.toHash('e028d69864df2ca00848a65269b3df3e1b3c867b0b4482769462ea38dc487732'),
    timestamp: 1388624318,
    bits: 419628831,
    nonce: 3386334543
  }
}
params.blockchain.checkpoints = [checkpoint]

runTest({
  name: 'mainnet',
  firstBlockHeight: 278319,
  firstTxHash: '685623401c3f5e9d2eaaf0657a50454e56a270ee7630d409e98d3bc257560098',
  firstInputAddress: '1Pcpxw6wJwXABhjCspe3CNf3gqSeh6eien',
  sbsOpts: {
    db: level('test.db'),
    from: 278208,
    addresses: ['1CounterpartyXXXXXXXXXXXXXXXUWLpVr'],
    params: params,
    network: networks.bitcoin
  }
})
