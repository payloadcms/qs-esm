'use strict'

import * as formats from './formats.js'

const has = Object.prototype.hasOwnProperty
const isArray = Array.isArray

const hexTable = (function () {
  const array = []
  for (let i = 0; i < 256; ++i) {
    array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase())
  }

  return array
})()

const compactQueue = function compactQueue(queue) {
  while (queue.length > 1) {
    const item = queue.pop()
    const obj = item.obj[item.prop]

    if (isArray(obj)) {
      const compacted = []

      for (let j = 0; j < obj.length; ++j) {
        if (typeof obj[j] !== 'undefined') {
          compacted.push(obj[j])
        }
      }

      item.obj[item.prop] = compacted
    }
  }
}

export const arrayToObject = function arrayToObject(source, options) {
  const obj = options && options.plainObjects ? Object.create(null) : {}
  for (let i = 0; i < source.length; ++i) {
    if (typeof source[i] !== 'undefined') {
      obj[i] = source[i]
    }
  }

  return obj
}

export const merge = function merge(target, source, options) {
  /* eslint no-param-reassign: 0 */
  if (!source) {
    return target
  }

  if (typeof source !== 'object') {
    if (isArray(target)) {
      target.push(source)
    } else if (target && typeof target === 'object') {
      if (
        (options && (options.plainObjects || options.allowPrototypes)) ||
        !has.call(Object.prototype, source)
      ) {
        target[source] = true
      }
    } else {
      return [target, source]
    }

    return target
  }

  if (!target || typeof target !== 'object') {
    return [target].concat(source)
  }

  let mergeTarget = target
  if (isArray(target) && !isArray(source)) {
    mergeTarget = arrayToObject(target, options)
  }

  if (isArray(target) && isArray(source)) {
    source.forEach(function (item, i) {
      if (has.call(target, i)) {
        const targetItem = target[i]
        if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
          target[i] = merge(targetItem, item, options)
        } else {
          target.push(item)
        }
      } else {
        target[i] = item
      }
    })
    return target
  }

  return Object.keys(source).reduce(function (acc, key) {
    const value = source[key]

    if (has.call(acc, key)) {
      acc[key] = merge(acc[key], value, options)
    } else {
      acc[key] = value
    }
    return acc
  }, mergeTarget)
}

export const assign = function assignSingleSource(target, source) {
  return Object.keys(source).reduce(function (acc, key) {
    acc[key] = source[key]
    return acc
  }, target)
}

export const decode = function (str, decoder, charset) {
  const strWithoutPlus = str.replace(/\+/g, ' ')
  if (charset === 'iso-8859-1') {
    // unescape never throws, no try...catch needed:
    return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape)
  }
  // utf-8
  try {
    return decodeURIComponent(strWithoutPlus)
  } catch (e) {
    return strWithoutPlus
  }
}

const limit = 1024

export const encode = function encode(str, defaultEncoder, charset, kind, format) {
  // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
  // It has been adapted here for stricter adherence to RFC 3986
  if (str.length === 0) {
    return str
  }

  let string = str
  if (typeof str === 'symbol') {
    string = Symbol.prototype.toString.call(str)
  } else if (typeof str !== 'string') {
    string = String(str)
  }

  if (charset === 'iso-8859-1') {
    return escape(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
      return '%26%23' + parseInt($0.slice(2), 16) + '%3B'
    })
  }

  let out = ''
  for (let j = 0; j < string.length; j += limit) {
    const segment = string.length >= limit ? string.slice(j, j + limit) : string
    const arr = []

    for (let i = 0; i < segment.length; ++i) {
      let c = segment.charCodeAt(i)
      if (
        c === 0x2d || // -
        c === 0x2e || // .
        c === 0x5f || // _
        c === 0x7e || // ~
        (c >= 0x30 && c <= 0x39) || // 0-9
        (c >= 0x41 && c <= 0x5a) || // a-z
        (c >= 0x61 && c <= 0x7a) || // A-Z
        (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) // ( )
      ) {
        arr[arr.length] = segment.charAt(i)
        continue
      }

      if (c < 0x80) {
        arr[arr.length] = hexTable[c]
        continue
      }

      if (c < 0x800) {
        arr[arr.length] = hexTable[0xc0 | (c >> 6)] + hexTable[0x80 | (c & 0x3f)]
        continue
      }

      if (c < 0xd800 || c >= 0xe000) {
        arr[arr.length] =
          hexTable[0xe0 | (c >> 12)] +
          hexTable[0x80 | ((c >> 6) & 0x3f)] +
          hexTable[0x80 | (c & 0x3f)]
        continue
      }

      i += 1
      c = 0x10000 + (((c & 0x3ff) << 10) | (segment.charCodeAt(i) & 0x3ff))

      arr[arr.length] =
        hexTable[0xf0 | (c >> 18)] +
        hexTable[0x80 | ((c >> 12) & 0x3f)] +
        hexTable[0x80 | ((c >> 6) & 0x3f)] +
        hexTable[0x80 | (c & 0x3f)]
    }

    out += arr.join('')
  }

  return out
}

export const compact = function compact(value) {
  const queue = [{ obj: { o: value }, prop: 'o' }]
  const refs = []

  for (let i = 0; i < queue.length; ++i) {
    const item = queue[i]
    const obj = item.obj[item.prop]

    const keys = Object.keys(obj)
    for (let j = 0; j < keys.length; ++j) {
      const key = keys[j]
      const val = obj[key]
      if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
        queue.push({ obj: obj, prop: key })
        refs.push(val)
      }
    }
  }

  compactQueue(queue)

  return value
}

export const isRegExp = function isRegExp(obj) {
  return Object.prototype.toString.call(obj) === '[object RegExp]'
}

export const isBuffer = function isBuffer(obj) {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj))
}

export const combine = function combine(a, b) {
  return [].concat(a, b)
}

export const maybeMap = function maybeMap(val, fn) {
  if (isArray(val)) {
    const mapped = []
    for (let i = 0; i < val.length; i += 1) {
      mapped.push(fn(val[i]))
    }
    return mapped
  }
  return fn(val)
}
