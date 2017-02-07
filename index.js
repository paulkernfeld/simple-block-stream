var assert = require('assert')
var EventEmitter = require('events')
var fs = require('fs')
var Readable = require('stream').Readable

var Filter = require('bitcoin-filter')
var PeerGroup = require('bitcoin-net').PeerGroup
var bitcoin = require('bitcoinjs-lib')
var Blockchain = require('blockchain-spv')
var CacheLiveStream = require('cache-live-stream')
var debug = require('debug')('simple-block-stream')
var inherits = require('inherits')
var JsonStream = require('JSONStream')
var mapStream = require('map-stream')
var assign = require('object-assign')
var pump = require('pump')
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

var blockToJson = function (block) {
  var transactions = []
  block.transactions.forEach(function (transaction) {
    transactions.push(transaction.toHex())
  })
  return {
    height: block.height,
    header: block.header.toHex(),
    transactions: transactions
  }
}

var blockFromJson = function (block) {
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
  self.deserialize = opts.json ? undefined : blockFromJson
  self.filtered = !opts.unfiltered

  self.pubkeyHashes = []
  self.addresses.forEach(function (addr) {
    self.pubkeyHashes.push(bitcoin.address.fromBase58Check(addr).hash)
  })

  self.chain = new Blockchain(self.params.blockchain, sublevel(opts.db, 'chain'))

  if (self.filtered) {
    self.filter = new Filter(self.peers)
    self.filter.add(self)
  } else {
    assert(!self.addresses.length)
  }

  self.chain.on('block', function (block) {
    if (block.height % 1000 === 0) {
      debug('headers at', block.height)
    }
    self.emit('header', block)
  })

  var makeStream = function (fromHash, cb) {
    debug('starting txs...')
    var chainReadStream = self.chain.createReadStream({ from: fromHash, inclusive: false })
    chainReadStream.on('data', function (block) {
      if (block.height % 1000 === 0) {
        debug('txs at', block.height)
      }
    })

    var blockStream = self.peers.createBlockStream({ filtered: self.filtered })

    var serializer = mapStream(function (block, cb) {
      cb(null, blockToJson(block))
    })

    pump(chainReadStream, blockStream, serializer)

    cb(null, serializer)
  }

  var startStream = function (latestCached, cb) {
    var fromHash
    var fromHeight

    if (self.closed) {
      // Return a stream that closes immediately
      var rs = new Readable()
      rs.push(null)
      return cb(null, rs)
    }

    if (latestCached) {
      // Start after the latest item in the cache
      console.log(latestCached.header)
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
      deserialize: self.deserialize,
      keyEncoding: 'hex'
    }
  )
  cache.readable.on('data', function (block) {
    self.emit('block', block)
  })
  self.stream = cache.readable

  self.peers.once('peer', function () {
    var headerStream = self.peers.createHeaderStream()
    pump(self.chain.createLocatorStream(), headerStream, self.chain.createWriteStream())
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

SimpleBlockStream.prototype.close = function (cb) {
  cb = cb || function () {}

  var self = this
  debug('closing...')
  // TODO PeerGroup's close method is a bit off... see https://github.com/mappum/bitcoin-net/issues/131
  this.peers.close(function (err) {
    self.closed = true
    debug('closed')
    cb(err)
  })
}

var fromFixture = function (opts) {
  var deserialize = opts.deserialize || blockFromJson
  var deserializer = mapStream(function (block, cb) {
    cb(null, deserialize(block))
  })
  var readFromFile = fs.createReadStream(opts.inputPath)

  // Pipe w/o end to simulate the real sbs, which needs to be closed
  var stream = readFromFile.pipe(JsonStream.parse('*')).pipe(deserializer, {end: false})

  return {
    stream: stream,
    close: stream.end
  }
}

module.exports = SimpleBlockStream
module.exports.blockToJson = blockToJson
module.exports.blockFromJson = blockFromJson
module.exports.blockFromObject = blockFromObject
module.exports.fromFixture = fromFixture
