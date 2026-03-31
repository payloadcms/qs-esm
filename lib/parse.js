'use strict'

import * as utils from './utils.js'

const has = Object.prototype.hasOwnProperty
const isArray = Array.isArray

const defaults = {
  allowDots: false,
  allowEmptyArrays: false,
  allowPrototypes: false,
  allowSparse: false,
  arrayLimit: 20,
  comma: false,
  decodeDotInKeys: false,
  decoder: utils.decode,
  delimiter: '&',
  depth: 5,
  duplicates: 'combine',
  ignoreQueryPrefix: false,
  parameterLimit: 1000,
  parseArrays: true,
  plainObjects: false,
  strictNullHandling: false,
}

const parseArrayValue = function (val, options) {
  if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
    return val.split(',')
  }

  return val
}

const parseValues = function parseQueryStringValues(str, options) {
  const obj = { __proto__: null }

  const cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str
  const limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit
  const parts = cleanStr.split(options.delimiter, limit)
  let i

  for (i = 0; i < parts.length; ++i) {
    const part = parts[i]

    const bracketEqualsPos = part.indexOf(']=')
    const pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1

    let key, val
    if (pos === -1) {
      key = options.decoder(part, defaults.decoder, 'key')
      val = options.strictNullHandling ? null : ''
    } else {
      key = options.decoder(part.slice(0, pos), defaults.decoder, 'key')
      val = utils.maybeMap(parseArrayValue(part.slice(pos + 1), options), function (encodedVal) {
        return options.decoder(encodedVal, defaults.decoder, 'value')
      })
    }

    if (part.indexOf('[]=') > -1) {
      val = isArray(val) ? [val] : val
    }

    const existing = has.call(obj, key)
    if (existing && options.duplicates === 'combine') {
      obj[key] = utils.combine(obj[key], val, options.arrayLimit, options.plainObjects)
    } else if (!existing || options.duplicates === 'last') {
      obj[key] = val
    }
  }

  return obj
}

const parseObject = function (chain, val, options, valuesParsed) {
  let leaf = valuesParsed ? val : parseArrayValue(val, options)

  for (let i = chain.length - 1; i >= 0; --i) {
    let obj
    const root = chain[i]

    if (root === '[]' && options.parseArrays) {
      if (utils.isOverflow(leaf)) {
        // leaf is already an overflow object, preserve it
        obj = leaf
      } else {
        obj =
          options.allowEmptyArrays && (leaf === '' || (options.strictNullHandling && leaf === null))
            ? []
            : utils.combine([], leaf, options.arrayLimit, options.plainObjects)
      }
    } else {
      obj = options.plainObjects ? Object.create(null) : {}
      const cleanRoot =
        root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root
      const decodedRoot = options.decodeDotInKeys ? cleanRoot.replace(/%2E/g, '.') : cleanRoot
      const index = parseInt(decodedRoot, 10)
      if (!options.parseArrays && decodedRoot === '') {
        obj = { 0: leaf }
      } else if (
        !isNaN(index) &&
        root !== decodedRoot &&
        String(index) === decodedRoot &&
        index >= 0 &&
        options.parseArrays &&
        index <= options.arrayLimit
      ) {
        obj = []
        obj[index] = leaf
      } else if (decodedRoot !== '__proto__') {
        obj[decodedRoot] = leaf
      }
    }

    leaf = obj
  }

  return leaf
}

const parseKeys = function parseQueryStringKeys(givenKey, val, options, valuesParsed) {
  if (!givenKey) {
    return
  }

  // Transform dot notation to bracket notation
  const key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey

  // The regex chunks

  const brackets = /(\[[^[\]]*])/
  const child = /(\[[^[\]]*])/g

  // Get the parent

  let segment = options.depth > 0 && brackets.exec(key)
  const parent = segment ? key.slice(0, segment.index) : key

  // Stash the parent if it exists

  const keys = []
  if (parent) {
    // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
    if (!options.plainObjects && has.call(Object.prototype, parent)) {
      if (!options.allowPrototypes) {
        return
      }
    }

    keys.push(parent)
  }

  // Loop through children appending to the array until we hit depth

  let i = 0
  while (options.depth > 0 && (segment = child.exec(key)) !== null && i < options.depth) {
    i += 1
    if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
      if (!options.allowPrototypes) {
        return
      }
    }
    keys.push(segment[1])
  }

  // If there's a remainder, just add whatever is left

  if (segment) {
    keys.push('[' + key.slice(segment.index) + ']')
  }

  return parseObject(keys, val, options, valuesParsed)
}

const normalizeParseOptions = function normalizeParseOptions(opts) {
  if (!opts) {
    return defaults
  }

  if (typeof opts.allowEmptyArrays !== 'undefined' && typeof opts.allowEmptyArrays !== 'boolean') {
    throw new TypeError('`allowEmptyArrays` option can only be `true` or `false`, when provided')
  }

  if (typeof opts.decodeDotInKeys !== 'undefined' && typeof opts.decodeDotInKeys !== 'boolean') {
    throw new TypeError('`decodeDotInKeys` option can only be `true` or `false`, when provided')
  }

  if (
    opts.decoder !== null &&
    typeof opts.decoder !== 'undefined' &&
    typeof opts.decoder !== 'function'
  ) {
    throw new TypeError('Decoder has to be a function.')
  }

  const duplicates = typeof opts.duplicates === 'undefined' ? defaults.duplicates : opts.duplicates

  if (duplicates !== 'combine' && duplicates !== 'first' && duplicates !== 'last') {
    throw new TypeError('The duplicates option must be either combine, first, or last')
  }

  const allowDots =
    typeof opts.allowDots === 'undefined'
      ? opts.decodeDotInKeys === true
        ? true
        : defaults.allowDots
      : !!opts.allowDots

  return {
    allowDots: allowDots,
    allowEmptyArrays:
      typeof opts.allowEmptyArrays === 'boolean'
        ? !!opts.allowEmptyArrays
        : defaults.allowEmptyArrays,
    allowPrototypes:
      typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
    allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
    arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
    comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
    decodeDotInKeys:
      typeof opts.decodeDotInKeys === 'boolean' ? opts.decodeDotInKeys : defaults.decodeDotInKeys,
    decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
    delimiter:
      typeof opts.delimiter === 'string' || utils.isRegExp(opts.delimiter)
        ? opts.delimiter
        : defaults.delimiter,
    // eslint-disable-next-line no-implicit-coercion, no-extra-parens
    depth: typeof opts.depth === 'number' || opts.depth === false ? +opts.depth : defaults.depth,
    duplicates: duplicates,
    ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
    parameterLimit:
      typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
    parseArrays: opts.parseArrays !== false,
    plainObjects:
      typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
    strictNullHandling:
      typeof opts.strictNullHandling === 'boolean'
        ? opts.strictNullHandling
        : defaults.strictNullHandling,
  }
}

export function parse(str, opts) {
  const options = normalizeParseOptions(opts)

  if (str === '' || str === null || typeof str === 'undefined') {
    return options.plainObjects ? Object.create(null) : {}
  }

  const tempObj = typeof str === 'string' ? parseValues(str, options) : str
  let obj = options.plainObjects ? Object.create(null) : {}

  // Iterate over the keys and setup the new object

  const keys = Object.keys(tempObj)
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]
    const newObj = parseKeys(key, tempObj[key], options, typeof str === 'string')
    obj = utils.merge(obj, newObj, options)
  }

  if (options.allowSparse === true) {
    return obj
  }

  return utils.compact(obj)
}
