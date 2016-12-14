var reverse = require('buffer-reverse')
var toArray = require('stream-to-array')
var tape = require('tape')

var SimpleBlockStream = require('..')

tape('read from fixture', function (t) {
  toArray(SimpleBlockStream.fromFixture({ inputPath: 'test/fixture.json' }), function (err, blocks) {
    t.error(err)
    t.same(blocks.length, 10)
    var lastEl = blocks[9]
    t.same(lastEl.height, 10)
    t.same(lastEl.transactions.length, 1)
    var tx = lastEl.transactions[0]
    var expectedHash = reverse(Buffer.from('d3ad39fa52a89997ac7381c95eeffeaf40b66af7a57e9eba144be0a175a12b11', 'hex'))
    t.same(tx.getHash(), expectedHash)
    t.end()
  })
})
