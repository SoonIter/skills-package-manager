import path from 'node:path'
import { ErrorCode, ParseError } from '../errors'
import { normalizeLinkSource } from '../specifiers/normalizeLinkSource'
import type { SpecifierData, SpecifierType } from './types'

export type ParsedSpecifierFragment = {
  sourcePart: string
  ref: string | null
  path: string
}

export class Specifier {
  readonly type: SpecifierType
  readonly source: string
  readonly ref: string | null
  readonly path: string
  readonly normalized: string
  readonly skillName: string

  private constructor(data: SpecifierData) {
    this.type = data.type
    this.source = data.source
    this.ref = data.ref
    this.path = data.path
    this.normalized = data.normalized
    this.skillName = data.skillName
  }

  static parseFragment(specifier: string): ParsedSpecifierFragment {
    const firstHashIndex = specifier.indexOf('#')
    const secondHashIndex = firstHashIndex >= 0 ? specifier.indexOf('#', firstHashIndex + 1) : -1

    if (secondHashIndex >= 0) {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: 'Invalid specifier: multiple # fragments are not supported',
        content: specifier,
      })
    }

    const sourcePart = firstHashIndex >= 0 ? specifier.slice(0, firstHashIndex) : specifier
    const fragment = firstHashIndex >= 0 ? specifier.slice(firstHashIndex + 1) : ''

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

  static parse(specifier: string): Specifier {
    if (specifier.startsWith('link:') && specifier.includes('#')) {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: 'Invalid link specifier: link: must point directly to a skill directory',
        content: specifier,
      })
    }

    let parsed: ParsedSpecifierFragment
    try {
      parsed = Specifier.parseFragment(specifier)
    } catch (error) {
      if (error instanceof ParseError) {
        throw error
      }

      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: `Invalid specifier: ${(error as Error).message}`,
        content: specifier,
        cause: error as Error,
      })
    }

    const type = parsed.sourcePart.startsWith('link:')
      ? 'link'
      : parsed.sourcePart.startsWith('file:')
        ? 'file'
        : parsed.sourcePart.startsWith('npm:')
          ? 'npm'
          : 'git'

    if (type === 'link') {
      const linkSource = normalizeLinkSource(parsed.sourcePart)
      const linkPath = linkSource.slice('link:'.length)
      return new Specifier({
        type,
        source: linkSource,
        ref: null,
        path: '/',
        normalized: linkSource,
        skillName: path.posix.basename(linkPath),
      })
    }

    const skillPath = parsed.path || '/'
    const normalized = parsed.ref
      ? `${parsed.sourcePart}#${parsed.ref}&path:${skillPath}`
      : parsed.path
        ? `${parsed.sourcePart}#path:${skillPath}`
        : parsed.sourcePart

    return new Specifier({
      type,
      source: parsed.sourcePart,
      ref: parsed.ref,
      path: skillPath,
      normalized,
      skillName: path.posix.basename(skillPath),
    })
  }

  toJSON(): SpecifierData {
    return {
      type: this.type,
      source: this.source,
      ref: this.ref,
      path: this.path,
      normalized: this.normalized,
      skillName: this.skillName,
    }
  }

  isEquivalentTo(other: Specifier | string): boolean {
    const compared = typeof other === 'string' ? Specifier.parse(other) : other
    return this.normalized === compared.normalized
  }
}
