var assert = require('assert')
var EventEmitter = require('events')

var Filter = require('bitcoin-filter')
var PeerGroup = require('bitcoin-net').PeerGroup
var bitcoin = require('bitcoinjs-lib')
var Blockchain = require('blockchain-spv')
var CacheLiveStream = require('cache-live-stream')
var debug = require('debug')('simple-block-stream')
var inherits = require('inherits')
var mapStream = require('map-stream')
var assign = require('object-assign')
var sublevel = require('subleveldown')
var mainnetParams = require('webcoin-bitcoin')

var Transaction = bitcoin.Transaction
var Block = bitcoin.Block

var bubbleError = function (from, to, name) {
  from.on('error', function (err) {
    console.log('error:', name)
    to.emit('error', err)
  })
}

var blockFromObject = function (obj) {
  return assign(new Block(), obj)
}

function SimpleBlockStream (opts) {
  if (!(this instanceof SimpleBlockStream)) return new SimpleBlockStream(opts)

  assert(typeof opts.db !== 'undefined')

  EventEmitter.call(this)

  debug('new SimpleBlockStream', opts.from)

  var self = this

  self.from = opts.from || 0
  self.addresses = opts.addresses || []  // TODO if addresses is empty we can just look at headers
  self.params = opts.params || mainnetParams
  self.network = opts.network || bitcoin.network
  self.peers = opts.peers || new PeerGroup(self.params.net)

  self.pubkeyHashes = []
  self.addresses.forEach(function (addr) {
    self.pubkeyHashes.push(bitcoin.address.fromBase58Check(addr).hash)
  })

  self.chain = new Blockchain(self.params.blockchain, sublevel(opts.db, 'chain'))

  self.filter = new Filter(self.peers)
  self.filter.add(self)

  self.chain.on('block', function (block) {
    if (block.height % 1000 === 0) {
      debug('headers at', block.height)
    }
    self.emit('header', block)
  })

  var deserialize = function (block) {
    var transactions = []
    block.transactions.forEach(function (transaction) {
      transactions.push(Transaction.fromHex(transaction))
    })
    return {
      height: block.height,
      header: Block.fromHex(block.header),
      transactions: transactions
    }
  }

  var makeStream = function (fromHash, cb) {
    debug('starting txs...')
    var chainReadStream = self.chain.createReadStream({ from: fromHash, inclusive: false })
    chainReadStream.on('data', function (block) {
      if (block.height % 1000 === 0) {
        debug('txs at', block.height)
      }
    })

    var blockStream = self.peers.createBlockStream({ filtered: true })
    chainReadStream.pipe(blockStream)

    var serializer = mapStream(function (block, cb) {
      var transactions = []
      block.transactions.forEach(function (transaction) {
        transactions.push(transaction.toHex())
      })
      cb(null, {
        height: block.height,
        header: block.header.toHex(),
        transactions: transactions
      })
    })
    blockStream.pipe(serializer)

    cb(null, serializer)
  }

  var startStream = function (latestCached, cb) {
    var fromHash
    var fromHeight

    if (latestCached) {
      // Start after the latest item in the cache
      fromHash = Buffer.from(latestCached.header.getHash())
      fromHeight = latestCached.height
    } else {
      // Nothing in the cache, start from a checkpoint or the genesis block
      fromHeight = self.from
      if (fromHeight === 0) {
        fromHash = Buffer.from(blockFromObject(self.params.blockchain.genesisHeader).getHash())
      } else {
        self.params.blockchain.checkpoints.forEach(function (checkpoint) {
          if (checkpoint.height === fromHeight) {
            fromHash = Buffer.from(blockFromObject(checkpoint.header).getHash())
          }
        })
        assert(fromHash, 'this.from did not match available checkpoints')
      }
    }

    debug('streaming from', fromHeight, fromHash.toString('hex'))
    makeStream(fromHash, cb)
  }

  var cache = CacheLiveStream(
    sublevel(opts.db, 'cache-live-stream', {valueEncoding: 'json'}),
    startStream,
    {
      deserialize: deserialize,
      keyEncoding: 'hex'
    }
  )
  cache.readable.on('data', function (block) {
    self.emit('block', block)
  })
  self.stream = cache.readable

  self.peers.once('peer', function () {
    var headerStream = self.peers.createHeaderStream()
    self.chain.createLocatorStream().pipe(headerStream)
    headerStream.pipe(self.chain.createWriteStream())
  })
  self.peers.connect()

  bubbleError(self.peers, self, 'peers')
  bubbleError(self.stream, self, 'stream')
  bubbleError(cache.readable, self, 'cache.readable')
}
inherits(SimpleBlockStream, EventEmitter)

// Implement the Filterable interface for the bitcoin-filter package.
SimpleBlockStream.prototype.filterElements = function () {
  return this.pubkeyHashes
}

module.exports = SimpleBlockStream
