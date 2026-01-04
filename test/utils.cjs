'use strict'

var test = require('tape')
var inspect = require('object-inspect')
var SaferBuffer = require('safer-buffer').Buffer
var forEach = require('for-each')

test('merge()', async function (t) {
  var utils = await import('../lib/utils.js')
  t.deepEqual(utils.merge(null, true), [null, true], 'merges true into null')

  t.deepEqual(utils.merge(null, [42]), [null, 42], 'merges null into an array')

  t.deepEqual(
    utils.merge({ a: 'b' }, { a: 'c' }),
    { a: ['b', 'c'] },
    'merges two objects with the same key',
  )

  var oneMerged = utils.merge({ foo: 'bar' }, { foo: { first: '123' } })
  t.deepEqual(
    oneMerged,
    { foo: ['bar', { first: '123' }] },
    'merges a standalone and an object into an array',
  )

  var twoMerged = utils.merge({ foo: ['bar', { first: '123' }] }, { foo: { second: '456' } })
  t.deepEqual(
    twoMerged,
    { foo: { 0: 'bar', 1: { first: '123' }, second: '456' } },
    'merges a standalone and two objects into an array',
  )

  var sandwiched = utils.merge({ foo: ['bar', { first: '123', second: '456' }] }, { foo: 'baz' })
  t.deepEqual(
    sandwiched,
    { foo: ['bar', { first: '123', second: '456' }, 'baz'] },
    'merges an object sandwiched by two standalones into an array',
  )

  var nestedArrays = utils.merge({ foo: ['baz'] }, { foo: ['bar', 'xyzzy'] })
  t.deepEqual(nestedArrays, { foo: ['baz', 'bar', 'xyzzy'] })

  var noOptionsNonObjectSource = utils.merge({ foo: 'baz' }, 'bar')
  t.deepEqual(noOptionsNonObjectSource, { foo: 'baz', bar: true })

  t.test(
    'avoids invoking array setters unnecessarily',
    { skip: typeof Object.defineProperty !== 'function' },
    function (st) {
      var setCount = 0
      var getCount = 0
      var observed = []
      Object.defineProperty(observed, 0, {
        get: function () {
          getCount += 1
          return { bar: 'baz' }
        },
        set: function () {
          setCount += 1
        },
      })
      utils.merge(observed, [null])
      st.equal(setCount, 0)
      st.equal(getCount, 1)
      observed[0] = observed[0] // eslint-disable-line no-self-assign
      st.equal(setCount, 1)
      st.equal(getCount, 2)
      st.end()
    },
  )

  t.test('with overflow objects (from arrayLimit)', function (st) {
    st.test('merges primitive into overflow object at next index', function (s2t) {
      // Create an overflow object via combine
      var overflow = utils.combine(['a'], 'b', 1, false)
      s2t.ok(utils.isOverflow(overflow), 'overflow object is marked')
      var merged = utils.merge(overflow, 'c')
      s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c' }, 'adds primitive at next numeric index')
      s2t.end()
    })

    st.test('merges primitive into regular object with numeric keys normally', function (s2t) {
      var obj = { 0: 'a', 1: 'b' }
      s2t.notOk(utils.isOverflow(obj), 'plain object is not marked as overflow')
      var merged = utils.merge(obj, 'c')
      s2t.deepEqual(
        merged,
        { 0: 'a', 1: 'b', c: true },
        'adds primitive as key (not at next index)',
      )
      s2t.end()
    })

    st.test('merges primitive into object with non-numeric keys normally', function (s2t) {
      var obj = { foo: 'bar' }
      var merged = utils.merge(obj, 'baz')
      s2t.deepEqual(merged, { foo: 'bar', baz: true }, 'adds primitive as key with value true')
      s2t.end()
    })

    st.test('merges overflow object into primitive', function (s2t) {
      // Create an overflow object via combine
      var overflow = utils.combine([], 'b', 0, false)
      s2t.ok(utils.isOverflow(overflow), 'overflow object is marked')
      var merged = utils.merge('a', overflow)
      s2t.ok(utils.isOverflow(merged), 'result is also marked as overflow')
      s2t.deepEqual(
        merged,
        { 0: 'a', 1: 'b' },
        'creates object with primitive at 0, source values shifted',
      )
      s2t.end()
    })

    st.test('merges overflow object with multiple values into primitive', function (s2t) {
      // Create an overflow object via combine
      var overflow = utils.combine(['b'], 'c', 1, false)
      s2t.ok(utils.isOverflow(overflow), 'overflow object is marked')
      var merged = utils.merge('a', overflow)
      s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c' }, 'shifts all source indices by 1')
      s2t.end()
    })

    st.test('merges regular object into primitive as array', function (s2t) {
      var obj = { foo: 'bar' }
      var merged = utils.merge('a', obj)
      s2t.deepEqual(merged, ['a', { foo: 'bar' }], 'creates array with primitive and object')
      s2t.end()
    })

    st.end()
  })

  t.end()
})

test('assign()', async function (t) {
  var utils = await import('../lib/utils.js')
  var target = { a: 1, b: 2 }
  var source = { b: 3, c: 4 }
  var result = utils.assign(target, source)

  t.equal(result, target, 'returns the target')
  t.deepEqual(target, { a: 1, b: 3, c: 4 }, 'target and source are merged')
  t.deepEqual(source, { b: 3, c: 4 }, 'source is untouched')

  t.end()
})

test('combine()', async function (t) {
  var utils = await import('../lib/utils.js')
  t.test('both arrays', function (st) {
    var a = [1]
    var b = [2]
    var combined = utils.combine(a, b)

    st.deepEqual(a, [1], 'a is not mutated')
    st.deepEqual(b, [2], 'b is not mutated')
    st.notEqual(a, combined, 'a !== combined')
    st.notEqual(b, combined, 'b !== combined')
    st.deepEqual(combined, [1, 2], 'combined is a + b')

    st.end()
  })

  t.test('one array, one non-array', function (st) {
    var aN = 1
    var a = [aN]
    var bN = 2
    var b = [bN]

    var combinedAnB = utils.combine(aN, b)
    st.deepEqual(b, [bN], 'b is not mutated')
    st.notEqual(aN, combinedAnB, 'aN + b !== aN')
    st.notEqual(a, combinedAnB, 'aN + b !== a')
    st.notEqual(bN, combinedAnB, 'aN + b !== bN')
    st.notEqual(b, combinedAnB, 'aN + b !== b')
    st.deepEqual([1, 2], combinedAnB, 'first argument is array-wrapped when not an array')

    var combinedABn = utils.combine(a, bN)
    st.deepEqual(a, [aN], 'a is not mutated')
    st.notEqual(aN, combinedABn, 'a + bN !== aN')
    st.notEqual(a, combinedABn, 'a + bN !== a')
    st.notEqual(bN, combinedABn, 'a + bN !== bN')
    st.notEqual(b, combinedABn, 'a + bN !== b')
    st.deepEqual([1, 2], combinedABn, 'second argument is array-wrapped when not an array')

    st.end()
  })

  t.test('neither is an array', function (st) {
    var combined = utils.combine(1, 2)
    st.notEqual(1, combined, '1 + 2 !== 1')
    st.notEqual(2, combined, '1 + 2 !== 2')
    st.deepEqual([1, 2], combined, 'both arguments are array-wrapped when not an array')

    st.end()
  })

  t.test('with arrayLimit', function (st) {
    st.test('under the limit', function (s2t) {
      var combined = utils.combine(['a', 'b'], 'c', 10, false)
      s2t.deepEqual(combined, ['a', 'b', 'c'], 'returns array when under limit')
      s2t.ok(Array.isArray(combined), 'result is an array')
      s2t.end()
    })

    st.test('exactly at the limit stays as array', function (s2t) {
      var combined = utils.combine(['a', 'b'], 'c', 3, false)
      s2t.deepEqual(combined, ['a', 'b', 'c'], 'stays as array when exactly at limit')
      s2t.ok(Array.isArray(combined), 'result is an array')
      s2t.end()
    })

    st.test('over the limit', function (s2t) {
      var combined = utils.combine(['a', 'b', 'c'], 'd', 3, false)
      s2t.deepEqual(
        combined,
        { 0: 'a', 1: 'b', 2: 'c', 3: 'd' },
        'converts to object when over limit',
      )
      s2t.notOk(Array.isArray(combined), 'result is not an array')
      s2t.end()
    })

    st.test('with arrayLimit 0', function (s2t) {
      var combined = utils.combine([], 'a', 0, false)
      s2t.deepEqual(combined, { 0: 'a' }, 'converts single element to object with arrayLimit 0')
      s2t.notOk(Array.isArray(combined), 'result is not an array')
      s2t.end()
    })

    st.test('with plainObjects option', function (s2t) {
      var combined = utils.combine(['a'], 'b', 1, true)
      var expected = { __proto__: null, 0: 'a', 1: 'b' }
      s2t.deepEqual(combined, expected, 'converts to object with null prototype')
      s2t.equal(
        Object.getPrototypeOf(combined),
        null,
        'result has null prototype when plainObjects is true',
      )
      s2t.end()
    })

    st.end()
  })

  t.test('with existing overflow object', function (st) {
    st.test('adds to existing overflow object at next index', function (s2t) {
      // Create overflow object first via combine
      var overflow = utils.combine(['a'], 'b', 1, false)
      s2t.ok(utils.isOverflow(overflow), 'initial object is marked as overflow')

      var combined = utils.combine(overflow, 'c', 10, false)
      s2t.equal(combined, overflow, 'returns the same object (mutated)')
      s2t.deepEqual(combined, { 0: 'a', 1: 'b', 2: 'c' }, 'adds value at next numeric index')
      s2t.end()
    })

    st.test('does not treat plain object with numeric keys as overflow', function (s2t) {
      var plainObj = { 0: 'a', 1: 'b' }
      s2t.notOk(utils.isOverflow(plainObj), 'plain object is not marked as overflow')

      // combine treats this as a regular value, not an overflow object to append to
      var combined = utils.combine(plainObj, 'c', 10, false)
      s2t.deepEqual(combined, [{ 0: 'a', 1: 'b' }, 'c'], 'concatenates as regular values')
      s2t.end()
    })

    st.end()
  })

  t.end()
})

test('isBuffer()', async function (t) {
  var utils = await import('../lib/utils.js')
  forEach(
    [null, undefined, true, false, '', 'abc', 42, 0, NaN, {}, [], function () {}, /a/g],
    function (x) {
      t.equal(utils.isBuffer(x), false, inspect(x) + ' is not a buffer')
    },
  )

  var fakeBuffer = { constructor: Buffer }
  t.equal(utils.isBuffer(fakeBuffer), false, 'fake buffer is not a buffer')

  var saferBuffer = SaferBuffer.from('abc')
  t.equal(utils.isBuffer(saferBuffer), true, 'SaferBuffer instance is a buffer')

  var buffer = Buffer.from && Buffer.alloc ? Buffer.from('abc') : new Buffer('abc')
  t.equal(utils.isBuffer(buffer), true, 'real Buffer instance is a buffer')
  t.end()
})
