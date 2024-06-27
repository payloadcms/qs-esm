'use strict'

import * as utils from './utils.js'
import * as formats from './formats.js'

const has = Object.prototype.hasOwnProperty

const arrayPrefixGenerators = {
  brackets: function brackets(prefix) {
    return prefix + '[]'
  },
  comma: 'comma',
  indices: function indices(prefix, key) {
    return prefix + '[' + key + ']'
  },
  repeat: function repeat(prefix) {
    return prefix
  },
}

const isArray = Array.isArray
const push = Array.prototype.push
const pushToArray = function (arr, valueOrArray) {
  push.apply(arr, isArray(valueOrArray) ? valueOrArray : [valueOrArray])
}

const toISO = Date.prototype.toISOString

const defaultFormat = formats['default']
const defaults = {
  addQueryPrefix: false,
  allowDots: false,
  allowEmptyArrays: false,
  arrayFormat: 'indices',
  charset: 'utf-8',
  charsetSentinel: false,
  delimiter: '&',
  encode: true,
  encodeDotInKeys: false,
  encoder: utils.encode,
  encodeValuesOnly: false,
  format: defaultFormat,
  formatter: formats.formatters[defaultFormat],
  // deprecated
  indices: false,
  serializeDate: function serializeDate(date) {
    return toISO.call(date)
  },
  skipNulls: false,
  strictNullHandling: false,
}

const isNonNullishPrimitive = function isNonNullishPrimitive(v) {
  return (
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    typeof v === 'symbol' ||
    typeof v === 'bigint'
  )
}

const sentinel = {}

const _stringify = function stringify(
  object,
  prefix,
  generateArrayPrefix,
  commaRoundTrip,
  allowEmptyArrays,
  strictNullHandling,
  skipNulls,
  encodeDotInKeys,
  encoder,
  filter,
  sort,
  allowDots,
  serializeDate,
  format,
  formatter,
  encodeValuesOnly,
  charset,
  sideChannel,
) {
  let obj = object

  let tmpSc = sideChannel
  let step = 0
  let findFlag = false
  while ((tmpSc = tmpSc.get(sentinel)) !== void undefined && !findFlag) {
    // Where object last appeared in the ref tree
    const pos = tmpSc.get(object)
    step += 1
    if (typeof pos !== 'undefined') {
      if (pos === step) {
        throw new RangeError('Cyclic object value')
      } else {
        findFlag = true // Break while
      }
    }
    if (typeof tmpSc.get(sentinel) === 'undefined') {
      step = 0
    }
  }

  if (typeof filter === 'function') {
    obj = filter(prefix, obj)
  } else if (obj instanceof Date) {
    obj = serializeDate(obj)
  } else if (generateArrayPrefix === 'comma' && isArray(obj)) {
    obj = utils.maybeMap(obj, function (value) {
      if (value instanceof Date) {
        return serializeDate(value)
      }
      return value
    })
  }

  if (obj === null) {
    if (strictNullHandling) {
      return encoder && !encodeValuesOnly
        ? encoder(prefix, defaults.encoder, charset, 'key', format)
        : prefix
    }

    obj = ''
  }

  if (isNonNullishPrimitive(obj) || utils.isBuffer(obj)) {
    if (encoder) {
      const keyValue = encodeValuesOnly
        ? prefix
        : encoder(prefix, defaults.encoder, charset, 'key', format)
      return [
        formatter(keyValue) +
          '=' +
          formatter(encoder(obj, defaults.encoder, charset, 'value', format)),
      ]
    }
    return [formatter(prefix) + '=' + formatter(String(obj))]
  }

  const values = []

  if (typeof obj === 'undefined') {
    return values
  }

  let objKeys
  if (generateArrayPrefix === 'comma' && isArray(obj)) {
    // we need to join elements in
    if (encodeValuesOnly && encoder) {
      obj = utils.maybeMap(obj, encoder)
    }
    objKeys = [{ value: obj.length > 0 ? obj.join(',') || null : void undefined }]
  } else if (isArray(filter)) {
    objKeys = filter
  } else {
    const keys = Object.keys(obj)
    objKeys = sort ? keys.sort(sort) : keys
  }

  const encodedPrefix = encodeDotInKeys ? prefix.replace(/\./g, '%2E') : prefix

  const adjustedPrefix =
    commaRoundTrip && isArray(obj) && obj.length === 1 ? encodedPrefix + '[]' : encodedPrefix

  if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
    return adjustedPrefix + '[]'
  }

  for (let j = 0; j < objKeys.length; ++j) {
    const key = objKeys[j]
    const value = typeof key === 'object' && typeof key.value !== 'undefined' ? key.value : obj[key]

    if (skipNulls && value === null) {
      continue
    }

    const encodedKey = allowDots && encodeDotInKeys ? key.replace(/\./g, '%2E') : key
    const keyPrefix = isArray(obj)
      ? typeof generateArrayPrefix === 'function'
        ? generateArrayPrefix(adjustedPrefix, encodedKey)
        : adjustedPrefix
      : adjustedPrefix + (allowDots ? '.' + encodedKey : '[' + encodedKey + ']')

    sideChannel.set(object, step)
    const valueSideChannel = new WeakMap()
    valueSideChannel.set(sentinel, sideChannel)
    pushToArray(
      values,
      _stringify(
        value,
        keyPrefix,
        generateArrayPrefix,
        commaRoundTrip,
        allowEmptyArrays,
        strictNullHandling,
        skipNulls,
        encodeDotInKeys,
        generateArrayPrefix === 'comma' && encodeValuesOnly && isArray(obj) ? null : encoder,
        filter,
        sort,
        allowDots,
        serializeDate,
        format,
        formatter,
        encodeValuesOnly,
        charset,
        valueSideChannel,
      ),
    )
  }

  return values
}

const normalizeStringifyOptions = function normalizeStringifyOptions(opts) {
  if (!opts) {
    return defaults
  }

  if (typeof opts.allowEmptyArrays !== 'undefined' && typeof opts.allowEmptyArrays !== 'boolean') {
    throw new TypeError('`allowEmptyArrays` option can only be `true` or `false`, when provided')
  }

  if (typeof opts.encodeDotInKeys !== 'undefined' && typeof opts.encodeDotInKeys !== 'boolean') {
    throw new TypeError('`encodeDotInKeys` option can only be `true` or `false`, when provided')
  }

  if (
    opts.encoder !== null &&
    typeof opts.encoder !== 'undefined' &&
    typeof opts.encoder !== 'function'
  ) {
    throw new TypeError('Encoder has to be a function.')
  }

  const charset = opts.charset || defaults.charset
  if (
    typeof opts.charset !== 'undefined' &&
    opts.charset !== 'utf-8' &&
    opts.charset !== 'iso-8859-1'
  ) {
    throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined')
  }

  let format = formats['default']
  if (typeof opts.format !== 'undefined') {
    if (!has.call(formats.formatters, opts.format)) {
      throw new TypeError('Unknown format option provided.')
    }
    format = opts.format
  }
  const formatter = formats.formatters[format]

  let filter = defaults.filter
  if (typeof opts.filter === 'function' || isArray(opts.filter)) {
    filter = opts.filter
  }

  let arrayFormat
  if (opts.arrayFormat in arrayPrefixGenerators) {
    arrayFormat = opts.arrayFormat
  } else if ('indices' in opts) {
    arrayFormat = opts.indices ? 'indices' : 'repeat'
  } else {
    arrayFormat = defaults.arrayFormat
  }

  if ('commaRoundTrip' in opts && typeof opts.commaRoundTrip !== 'boolean') {
    throw new TypeError('`commaRoundTrip` must be a boolean, or absent')
  }

  const allowDots =
    typeof opts.allowDots === 'undefined'
      ? opts.encodeDotInKeys === true
        ? true
        : defaults.allowDots
      : !!opts.allowDots

  return {
    addQueryPrefix:
      typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
    allowDots: allowDots,
    allowEmptyArrays:
      typeof opts.allowEmptyArrays === 'boolean'
        ? !!opts.allowEmptyArrays
        : defaults.allowEmptyArrays,
    arrayFormat: arrayFormat,
    charset: charset,
    charsetSentinel:
      typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
    commaRoundTrip: opts.commaRoundTrip,
    delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
    encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
    encodeDotInKeys:
      typeof opts.encodeDotInKeys === 'boolean' ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
    encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
    encodeValuesOnly:
      typeof opts.encodeValuesOnly === 'boolean'
        ? opts.encodeValuesOnly
        : defaults.encodeValuesOnly,
    filter: filter,
    format: format,
    formatter: formatter,
    serializeDate:
      typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
    skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
    sort: typeof opts.sort === 'function' ? opts.sort : null,
    strictNullHandling:
      typeof opts.strictNullHandling === 'boolean'
        ? opts.strictNullHandling
        : defaults.strictNullHandling,
  }
}

export function stringify(object, opts) {
  let obj = object
  const options = normalizeStringifyOptions(opts)

  let objKeys
  let filter

  if (typeof options.filter === 'function') {
    filter = options.filter
    obj = filter('', obj)
  } else if (isArray(options.filter)) {
    filter = options.filter
    objKeys = filter
  }

  const keys = []

  if (typeof obj !== 'object' || obj === null) {
    return ''
  }

  const generateArrayPrefix = arrayPrefixGenerators[options.arrayFormat]
  const commaRoundTrip = generateArrayPrefix === 'comma' && options.commaRoundTrip

  if (!objKeys) {
    objKeys = Object.keys(obj)
  }

  if (options.sort) {
    objKeys.sort(options.sort)
  }

  const sideChannel = new WeakMap()
  for (let i = 0; i < objKeys.length; ++i) {
    const key = objKeys[i]

    if (options.skipNulls && obj[key] === null) {
      continue
    }
    pushToArray(
      keys,
      _stringify(
        obj[key],
        key,
        generateArrayPrefix,
        commaRoundTrip,
        options.allowEmptyArrays,
        options.strictNullHandling,
        options.skipNulls,
        options.encodeDotInKeys,
        options.encode ? options.encoder : null,
        options.filter,
        options.sort,
        options.allowDots,
        options.serializeDate,
        options.format,
        options.formatter,
        options.encodeValuesOnly,
        options.charset,
        sideChannel,
      ),
    )
  }

  const joined = keys.join(options.delimiter)
  let prefix = options.addQueryPrefix === true ? '?' : ''

  if (options.charsetSentinel) {
    if (options.charset === 'iso-8859-1') {
      // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
      prefix += 'utf8=%26%2310003%3B&'
    } else {
      // encodeURIComponent('✓')
      prefix += 'utf8=%E2%9C%93&'
    }
  }

  return joined.length > 0 ? prefix + joined : ''
}
