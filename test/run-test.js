#!/usr/bin/env node
var bitcoin = require('bitcoinjs-lib')
var reverse = require('buffer-reverse')
var mapStream = require('map-stream')
var pump = require('pump')
var tape = require('tape')

var SimpleBlockStream = require('..')

module.exports = function (opts) {
  tape(opts.name, function (t) {
    var sbs = SimpleBlockStream(opts.sbsOpts)
    var seenFirstTx = false

    var checkBlock = mapStream(function (block, cb) {
      if (block.transactions.length && !seenFirstTx) {
        seenFirstTx = true
        t.same(block.height, opts.firstBlockHeight)
        t.same(block.transactions.length, 1)
        var tx = block.transactions[0]
        console.log(tx)
        t.same(
          reverse(tx.getHash()).toString('hex'),
          opts.firstTxHash
        )
        t.same(tx.ins.length, 1)
        for (var i in tx.ins) {
          var input = tx.ins[i]
          if (bitcoin.script.isPubKeyHashInput(input.script)) {
            var pubkeyHash = bitcoin.crypto.hash160(bitcoin.script.decompile(input.script)[1])
            t.same(pubkeyHash, bitcoin.address.fromBase58Check(opts.firstInputAddress).hash)
            sbs.close(function (err) {
              t.end(err)
            })
          } else {
            t.fail()
          }
        }
      }
      cb()
    })

    pump(sbs.stream, checkBlock)
  })
}
