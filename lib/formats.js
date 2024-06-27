'use strict'

const replace = String.prototype.replace
const percentTwenties = /%20/g

const Format = {
  RFC1738: 'RFC1738',
  RFC3986: 'RFC3986',
}

export const formatters = {
  RFC1738: function (value) {
    return replace.call(value, percentTwenties, '+')
  },
  RFC3986: function (value) {
    return String(value)
  },
}
export const RFC1738 = Format.RFC1738
export const RFC3986 = Format.RFC3986

export default Format.RFC3986
