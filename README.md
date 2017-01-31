# simple-block-stream

**A simple way to stream blockchains with webcoin**

This library makes it easy to stream blockchains with [webcoin](https://github.com/mappum/webcoin). It provides sensible defaults for most behavior and parameters.

## Usage

`npm install simple-block-stream`

This library uses [debug](https://github.com/visionmedia/debug); set the env var `DEBUG` to `simple-block-stream` to see debug logs.

Options:

- `db` (required): a LevelUp database
- `addresses`: an array of addresses to include (default `[]`)
- `unfiltered`: if true, include all addresses (default `false`)
- `from`: include blocks starting at this height (default `0`)
- `params`: the params of the blockchain (default Bitcoin mainnet)
- `network`: the network of the blockchain (default Bitcoin mainnet)
- `peer`: the PeerGroup of the blockchain (default Bitcoin mainnet)
- `json`: if true, produce JSON-serializable objects (default `false`)

```js
var SimpleBlockStream = require('simple-block-stream')

var memdb = require('memdb')

var sbs = SimpleBlockStream({
  db: memdb(),
  addresses: ['1LNWw6yCxkUmkhArb2Nf2MPw6vG7u5WG7q']
})

// print to the console when we see a block
sbs.stream.on('data', function (block) {
  if (block.transactions.length) {
    console.log('txs:', block.transactions)
  }
})
```

Call `sbs.close` when you're done.

## Fixtures

You can use fixtures to make your unit tests fast and reliable.

Use the `make-fixture` binary to save a fixture:

`make-fixture --outputPath fixture.json --fixtureHeight 1000`

Use the `fromFixture` method to read a fixture out. The fixture acts just like a `SimpleBlockStream`.

```js
var SimpleBlockStream = require('simple-block-stream')
SimpleBlockStream.fromFixture({inputPath: 'fixture.json'}).stream.on('data', console.log)
```
