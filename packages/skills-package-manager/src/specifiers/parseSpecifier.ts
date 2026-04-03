import { ErrorCode, ParseError } from '../errors'

export function parseSpecifier(specifier: string) {
  const firstHashIndex = specifier.indexOf('#')
  const secondHashIndex = firstHashIndex >= 0 ? specifier.indexOf('#', firstHashIndex + 1) : -1

  if (secondHashIndex >= 0) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: 'Invalid specifier: multiple # fragments are not supported',
      content: specifier,
    })
  }

  const hashIndex = firstHashIndex
  const sourcePart = hashIndex >= 0 ? specifier.slice(0, hashIndex) : specifier
  const fragment = hashIndex >= 0 ? specifier.slice(hashIndex + 1) : ''

  if (!sourcePart) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: 'Specifier source is required',
      content: specifier,
    })
  }

  if (!fragment) {
    return {
      sourcePart,
      ref: null,
      path: '',
    }
  }

  const parts = fragment.split('&').filter(Boolean)
  let ref: string | null = null
  let parsedPath = ''

  for (const part of parts) {
    if (part.startsWith('path:')) {
      parsedPath = part.slice('path:'.length)
      continue
    }

    if (ref === null) {
      ref = part
    }
  }

  return {
    sourcePart,
    ref,
    path: parsedPath,
  }
}
